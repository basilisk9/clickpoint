const DEFAULT_BASE = "https://logfare.ai/v1";
const DEFAULT_MODEL = "glm-5.3";
const DEFAULT_FALLBACK_MODELS = "";

// Retryable calls loop forever until one succeeds (see chat/chatJson): a
// failure retries with backoff instead of ever being given up on. The only
// escape is a non-retryable error (401/403/404), which cannot be fixed by
// retrying, so we throw immediately rather than loop on a guaranteed loss.
const RETRY_BASE_DELAY_MS = 900;
// Cap on the exponential-backoff exponent, so a long outage settles on a
// steady ~1 min retry instead of growing without bound.
const MAX_BACKOFF_EXPONENT = 6;
// Ceiling for the per-retry max_tokens escalation.
const MAX_TOKEN_CEILING = 48_000;
// Hard ceiling on one HTTP attempt. inclusionai/ling-3.1-flash reasons for
// ~7000 hidden tokens before writing any card HTML and runs at ~75 tok/s, so
// a legitimate card can need ~150s. Cutting it off early just wastes it.
const REQUEST_TIMEOUT_MS = 240_000;
// Logfare's gateway stops upstream generation at roughly ~120s and answers
// 503. When a call dies after running that long, asking for more tokens only
// guarantees the next attempt dies the same way, so we ask for less instead.
const GATEWAY_CUTOFF_MS = 100_000;
// Appended to the prompt when a previous attempt was cut off for length.
const BREVITY_DIRECTIVE =
  "The previous attempt was cut off for length, so keep this regeneration tight: " +
  "one visual, a compact formalization, no more than 2 worked examples, and keep " +
  "the visible answer under ~2500 tokens. A valid, complete JSON document matters " +
  "more than length.";

function briefedMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== "user") return messages;
  return [
    ...messages.slice(0, -1),
    { role: "user", content: `${last.content}\n\n${BREVITY_DIRECTIVE}` },
  ];
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
};

type ContentPart = { text?: unknown };

type LogfareResponse = {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: unknown };
  }>;
};

type ModelConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbacks: string[];
  // Reasoning models (Qwen 3.x, Step) burn most of a large max_tokens budget
  // on hidden reasoning before writing any visible text. Measured on an
  // outline-sized call: 27s and 1281 completion tokens with thinking on, 6.5s
  // and 298 with it off. Opt in per deployment, because the flag is a
  // chat-template hint that not every provider accepts.
  disableThinking: boolean;
  // OpenRouter-style `reasoning` object, for models whose thinking is
  // mandatory and can only be throttled to an effort level. glm-5.3 always
  // reasons and defaults to `max`, which would spend most of a card's token
  // budget before writing any HTML, so the deployment pins `low`. Sent only
  // when LOGFARE_REASONING_EFFORT is set, since a model that does not accept
  // the field needs it omitted entirely.
  reasoningEffort: string;
};

type CallResult =
  | { ok: true; content: string; model: string }
  | {
      ok: false;
      model: string;
      status: number | null;
      retryable: boolean;
      error: string;
      elapsedMs: number;
    };

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function parseFallbacks(primary: string): string[] {
  const raw = process.env.LOGFARE_FALLBACK_MODELS;
  // An explicitly empty value is how you switch fallbacks off.
  if (raw !== undefined && raw.trim() === "") return [];

  const list = (raw ?? DEFAULT_FALLBACK_MODELS)
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name !== primary);

  return Array.from(new Set(list));
}

function getConfig(): ModelConfig {
  const apiKey = process.env.LOGFARE_API_KEY;
  if (!apiKey) {
    throw new Error("LOGFARE_API_KEY is missing. Paste your Logfare key into .env.local.");
  }
  const model = process.env.LOGFARE_MODEL || DEFAULT_MODEL;
  return {
    apiKey,
    baseUrl: (process.env.LOGFARE_BASE_URL || DEFAULT_BASE).replace(/\/$/, ""),
    model,
    fallbacks: parseFallbacks(model),
    disableThinking: process.env.LOGFARE_DISABLE_THINKING === "true",
    reasoningEffort: (process.env.LOGFARE_REASONING_EFFORT || "").trim(),
  };
}

// Providers are inconsistent about this field: some return a plain string,
// some return an array of content parts, and some return null when an
// upstream provider hiccups mid-request.
function normalizeContent(raw: unknown): string | null {
  if (typeof raw === "string") {
    return raw.trim().length > 0 ? raw : null;
  }

  if (Array.isArray(raw)) {
    const joined = raw
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const text = (part as ContentPart).text;
          if (typeof text === "string") return text;
        }
        return "";
      })
      .join("")
      .trim();
    return joined.length > 0 ? joined : null;
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Models are imperfect JSON writers, and a card is a large document so a
// single slip loses the whole node. These two passes fix the near-misses we
// actually see in the logs; both are only ever applied after a strict parse
// has already failed, and the result is validated by parsing again.
// Decides whether the backslash at position i-1 is a real JSON escape that
// must be kept, or the start of a KaTeX command that must be preserved as a
// literal backslash. Cards render math with KaTeX, so the model writes
// commands like \frac, \sqrt, \Delta, \nu, \rho inside the html string. A
// single backslash before a letter is always one of those commands here:
// valid JSON text escapes for control chars (\n \r \t \b \f) do not occur in
// an HTML document (real line breaks arrive as literal newlines and are
// escaped separately), so treating \f as a form-feed would silently corrupt
// \frac. We therefore keep only the structural escapes — \" \\ \/ and \uXXXX —
// and double every other backslash, so "\frac" in the raw becomes the literal
// "\frac" once parsed.
function isLegalJsonEscape(text: string, i: number): boolean {
  const ch = text[i];
  if (ch === '"' || ch === "\\" || ch === "/") return true;
  if (ch === "u") {
    return /^[0-9a-fA-F]{4}/.test(text.slice(i + 1, i + 5));
  }
  return false;
}

function escapeControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        out += ch;
        continue;
      }
      if (ch === "\\") {
        // Double an illegal escape (a LaTeX command) so it survives parsing
        // as a literal backslash instead of throwing or corrupting.
        if (!isLegalJsonEscape(text, i + 1)) {
          out += "\\\\";
          continue;
        }
        escape = true;
        out += ch;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        // A literal newline inside an HTML string is invalid JSON but very
        // common; escape it rather than throwing the card away.
        out +=
          ch === "\n"
            ? "\\n"
            : ch === "\r"
              ? "\\r"
              : ch === "\t"
                ? "\\t"
                : `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

function repairJson(text: string): string {
  let out = escapeControlCharsInStrings(text);
  // { html: ... } -> { "html": ... }
  out = out.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');
  // Trailing commas before a closing brace or bracket.
  out = out.replace(/,(\s*[}\]])/g, "$1");
  return out;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.search(/[\{\[]/);
  if (start === -1) {
    throw new Error("Model did not return JSON.");
  }

  const objectStart = raw.indexOf("{", start);
  const arrayStart = raw.indexOf("[", start);
  const isArray =
    arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart);
  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";
  const begin = isArray ? arrayStart : objectStart;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = begin; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    if (ch === close) depth -= 1;
    if (depth === 0) {
      const slice = raw.slice(begin, i + 1);
      try {
        return JSON.parse(slice);
      } catch (strictError) {
        try {
          return JSON.parse(repairJson(slice));
        } catch {
          // Report the strict error: it is the more useful one.
          throw strictError;
        }
      }
    }
  }

  throw new Error("Model returned incomplete JSON.");
}

// Next.js patches global fetch on the server, so `signal` is not reliable for
// bounding a request. Race the work against a timer instead.
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(
        `[clickpoint] ${label} exceeded ${ms}ms — abandoning this attempt.`,
      );
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function performRequest(
  config: ModelConfig,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions,
  timeoutMs: number,
): Promise<CallResult> {
  const began = Date.now();
  // Reasoning models spend most of a large max_tokens budget on hidden
  // reasoning. Ask for thinking off, but keep a plain request as the second
  // variant so a provider that rejects the hint still gets served.
  const variants: Array<Record<string, unknown>> = config.disableThinking
    ? [{ chat_template_kwargs: { enable_thinking: false } }, {}]
    : [{}];
  // Effort is capped per deployment, but a provider that rejects the field
  // must still be served, so it is dropped on a 400 like the hint above.
  if (config.reasoningEffort) {
    variants.forEach((variant) => {
      variant.reasoning = { effort: config.reasoningEffort };
    });
  }

  let rejection = "";

  for (const extra of variants) {
    const started = Date.now();
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 8000,
        ...extra,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (process.env.LOGFARE_DEBUG === "true") {
      console.warn(
        `[clickpoint] ${model} responded ${response.status} in ${
          Date.now() - started
        }ms (timeout ${timeoutMs}ms, max_tokens ${
          options.maxTokens ?? 8000
        }, thinking ${Object.keys(extra).length > 0 ? "off" : "on"}).`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = `Logfare ${response.status} on ${model}: ${
        detail.slice(0, 300) || response.statusText
      }`;
      // A 400 while carrying the thinking-off hint usually means the provider
      // does not know that parameter. Drop it and ask again before failing.
      if (response.status === 400 && Object.keys(extra).length > 0) {
        rejection = error;
        continue;
      }
      // OpenRouter-style gateways signal an exhausted daily free-tier quota
      // (429 with a limit_source like openrouter_free_tier_daily). Unlike a
      // transient shared-pool 429 it will not clear within seconds, so do not
      // burn the backoff attempts on this model — move down the chain.
      const hardLimit =
        response.status === 429 &&
        /limit_source|free.?tier|daily.?limit/i.test(detail);
      return {
        ok: false,
        model,
        status: response.status,
        retryable: hardLimit ? false : isRetryableStatus(response.status),
        error,
        elapsedMs: Date.now() - began,
      };
    }

    const data = (await response.json()) as LogfareResponse;
    const content = normalizeContent(data.choices?.[0]?.message?.content);
    // With `logfare/auto` the router picks the model, so report what served us.
    const servedBy = data.model ?? model;

    if (!content) {
      // A 200 carrying no text is how Logfare surfaces an upstream provider
      // failure, so retry it instead of failing the whole build.
      const reason = data.choices?.[0]?.finish_reason;
      const detail =
        reason === "length"
          ? " (finish_reason: length — the token budget ran out before any text was written)"
          : reason
            ? ` (finish_reason: ${reason})`
            : "";
      return {
        ok: false,
        model,
        status: null,
        retryable: true,
        error: `Logfare returned no text from ${servedBy}${detail}.`,
        elapsedMs: Date.now() - began,
      };
    }

    return { ok: true, content, model: servedBy };
  }

  return {
    ok: false,
    model,
    status: 400,
    retryable: false,
    error: rejection || `Every request variant was rejected by ${model}.`,
    elapsedMs: Date.now() - began,
  };
}

async function callModel(
  config: ModelConfig,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions,
  timeoutMs: number,
): Promise<CallResult> {
  const began = Date.now();
  try {
    return await withTimeout(
      performRequest(config, model, messages, options, timeoutMs),
      timeoutMs,
      `Logfare request on ${model}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      model,
      status: null,
      retryable: true,
      error: `Logfare request failed on ${model}: ${message}`,
      elapsedMs: Date.now() - began,
    };
  }
}

export async function chat(messages: ChatMessage[], options: ChatOptions = {}) {
  const config = getConfig();
  const chain = [config.model, ...config.fallbacks];

  // Tokens actually wanted. It starts at the caller's budget, grows when a
  // failure looks like truncation, and shrinks when a failure looks like a
  // gateway cutoff — a retry after a 100s+ 503 asks for roughly half as much,
  // plus a brevity nudge in the prompt, instead of twice as much. It carries
  // across models: a cutoff on the primary tells the fallback to stay small.
  let wantedTokens = options.maxTokens ?? 8000;
  let shrink = false;

  // Every retryable failure loops the whole chain again and again until one
  // model actually answers. attempt counts retries across all models so the
  // backoff keeps growing through a long outage, and modelIndex only advances
  // when the current model's own request fails, so we round-robin the chain.
  let attempt = 0;
  let modelIndex = 0;

  // Forever is intentional: the call does not resolve until it succeeds or
  // hits a non-retryable error. That is what "retry until it doesn't fail"
  // means. The runtime bound is the surrounding request timeout, not this loop.
  for (;;) {
    const model = chain[modelIndex % chain.length];

    const attemptOptions: ChatOptions = {
      ...options,
      // Never shrink below what the caller asked for: on a reasoning model
      // that floor is what pays for the hidden reasoning, and dropping under
      // it guarantees an empty answer. The brevity nudge below is the real
      // lever on a retry, since a smaller task needs less thinking.
      maxTokens: shrink
        ? Math.max(
            options.maxTokens ?? 2000,
            Math.floor(wantedTokens / 2),
          )
        : Math.min(wantedTokens, MAX_TOKEN_CEILING),
    };
    const attemptMessages = shrink ? briefedMessages(messages) : messages;
    const result = await callModel(
      config,
      model,
      attemptMessages,
      attemptOptions,
      REQUEST_TIMEOUT_MS,
    );

    if (result.ok) {
      if (attempt > 0 || shrink) {
        console.warn(
          `[clickpoint] ${result.model} answered after ${attempt} retries.`,
        );
      }
      return result.content;
    }

    // A 401/403/404 will not fix itself by retrying or switching models, so
    // this is the only way out of the loop other than success.
    if (!result.retryable) {
      throw new Error(result.error);
    }

    const cutoff =
      result.elapsedMs >= GATEWAY_CUTOFF_MS ||
      /timed out after/.test(result.error);
    if (cutoff) {
      // The gateway cut generation off. Remember a smaller budget and ask
      // the model to be tight; do not inflate the retry.
      shrink = true;
      wantedTokens = attemptOptions.maxTokens ?? wantedTokens;
    } else if (
      /finish_reason: length|incomplete JSON|returned no text/i.test(
        result.error,
      )
    ) {
      // The answer itself ran dry. More headroom may genuinely help.
      shrink = false;
      wantedTokens = Math.min(wantedTokens * 2, MAX_TOKEN_CEILING);
    }

    // A shared-pool 429 is telling us to stand down; a sub-second retry just
    // adds to the congestion it was rate-limited for. Every other failure
    // backs off exponentially, capped so a long outage settles on ~1 min.
    const delay =
      result.status === 429
        ? 4000 + Math.floor(Math.random() * 4000)
        : RETRY_BASE_DELAY_MS *
            2 ** Math.min(attempt, MAX_BACKOFF_EXPONENT) +
          Math.floor(Math.random() * 250);
    attempt += 1;
    modelIndex += 1;
    console.warn(
      `[clickpoint] ${result.error}${
        cutoff ? " Asking for a tighter regeneration." : ""
      } Retry #${attempt} on ${chain[modelIndex % chain.length]} in ${delay}ms.`,
    );
    await sleep(delay);
  }
}


export async function chatJson<T>(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<T> {
  let lastError: Error | null = null;
  // Escalates when an envelope comes back broken: a response that fails to
  // parse is usually one that was cut off at the cap, so the next attempt
  // asks for double the headroom instead of the same doomed budget.
  let budget = options.maxTokens ?? 8000;
  let attempt = 0;

  // Bounded retry. Previously this looped forever: a model that kept emitting
  // malformed JSON would be re-called with an ever-larger budget until it hit
  // MAX_TOKEN_CEILING, burning time and tokens with no way out. Four attempts
  // is enough for the truncation case this exists to handle, and failing loudly
  // afterwards surfaces the regenerate button instead of hanging the request.
  const MAX_PARSE_ATTEMPTS = 4;
  while (attempt < MAX_PARSE_ATTEMPTS) {
    attempt += 1;
    const content = await chat(messages, { ...options, maxTokens: budget });
    try {
      return extractJson(content) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[clickpoint] JSON parse attempt ${attempt} failed: ${lastError.message}`,
      );
      if (process.env.LOGFARE_DEBUG === "true") {
        console.warn(
          `[clickpoint] Head of that response: ${content
            .slice(0, 240)
            .replace(/\s+/g, " ")}`,
        );
      }
      budget = Math.min(budget * 2, MAX_TOKEN_CEILING);
    }
  }
  throw new Error(
    `Model did not return parseable JSON after ${MAX_PARSE_ATTEMPTS} attempts: ${
      lastError?.message ?? "unknown error"
    }`,
  );
}
