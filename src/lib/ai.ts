const DEFAULT_BASE = "https://logfare.ai/v1";
const DEFAULT_MODEL = "deepseek-v4.1-flash-1017";
// Per-process cooldown: prefer a healthy backup on subsequent calls, then
// probe the configured primary again. A cooling model is still a last resort.
const MODEL_COOLDOWN_MS = 60_000;
const unavailableUntil = new Map<string, number>();
const unsupportedFields = new Map<string, Set<string>>();
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
//
// This used to say "one visual, no more than 2 worked examples, under ~2500
// tokens", which silently gutted every card slow enough to trip the cutoff:
// the model obeyed, and the product shipped 450-word cards that taught nothing.
// The fix is to preserve the CARD's structure and cut only the fat — the
// reference spine (visual, invariant, ledger, moves, trick, checks, scope,
// 4-example ramp) must survive a retry, or the retry is worthless.
const BREVITY_DIRECTIVE =
  "The previous attempt was cut off for length. Regenerate so the JSON closes " +
  "cleanly, but keep the card's required structure: one interactive visual " +
  "(shorten the JS, not the pedagogy — no animation loop if a redraw-on-input " +
  "will do), the invariant, the ledger, the moves, the trick, the endpoint " +
  "checks, the scope, and all 4-5 worked examples. Trim adjectives, restated " +
  "lines, and optional asides — never a section, never an example, never the " +
  "exam numbers. A complete, parseable JSON document matters most.";

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
  /* A card must not be "shrunk" on retry: its length IS the product. Set this
     and a gateway cutoff re-asks the SAME structure with a shorter JS bundle
     instead of collapsing to two examples. */
  keepStructure?: boolean;
  /* Route this call to a specific model instead of the default one. The visual
     pass uses a different model from the content pass: the two jobs want
     different strengths, and a single model writing both writes prose about a
     picture it has not committed to yet. */
  model?: string;
  /* Per-call reasoning effort. The default model reasons optionally and the
     deployment's default effort is "high"; on a drawing pass that hidden
     thinking can consume the whole budget and return nothing at all, so the
     visual call pins this to "none". */
  reasoningEffort?: string;
  /* Bound the retry loop. It is unbounded by design for content, where any
     answer is worth waiting for, but the provider returns an empty body on a
     nondeterministic fraction of visual requests — retrying that forever turns
     a flaky drawing into a ten-minute stall. A visual that cannot be drawn is
     optional; the card is not. */
  maxAttempts?: number;
};

type ContentPart = { text?: unknown };

type LogfareResponse = {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    /* `reasoning_content` is hidden thinking, never the reply. Documented
       here because it is present on the wire and must not be mistaken for
       an answer when `content` is empty. */
    message?: { content?: unknown; reasoning_content?: unknown };
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
  // OpenRouter-style `reasoning` object, for models whose thinking can be
  // throttled to an effort level. deepseek-v4.1-flash-1017 reasons optionally
  // (max | high | low | none) and defaults to "high", so the deployment pins
  // `low` to keep the token budget on the visible card. Sent only when
  // LOGFARE_REASONING_EFFORT is set, since a model that does not accept the
  // field needs it omitted entirely.
  reasoningEffort: string;
};

type CallResult =
  | { ok: true; content: string; model: string }
  | {
      ok: false;
      model: string;
      status: number | null;
      action: "retry" | "unavailable" | "incompatible" | "fatal";
      error: string;
      elapsedMs: number;
    };

function modelKey(config: ModelConfig, model: string) {
  return `${config.baseUrl}\n${model}`;
}

function failureAction(status: number, detail: string) {
  if (status === 401 || status === 403) return "fatal";
  if (status === 404 || (status === 429 && /limit_source|free.?tier|daily.?limit/i.test(detail))) {
    return "unavailable";
  }
  if (status === 408 || status === 429 || status >= 500) return "retry";
  if (status === 400 || status === 422) {
    if (/model_not_found|unknown model|invalid model|model[^\n]{0,100}(?:not found|unavailable|does not exist)/i.test(detail)) {
      return "unavailable";
    }
    if (/unsupported[_ ](?:parameter|value)|not supported (?:with|by|for) this model|context_length_exceeded/i.test(detail)) {
      return "incompatible";
    }
  }
  return "fatal";
}

function parseFallbacks(primary: string): string[] {
  const list = (process.env.LOGFARE_FALLBACK_MODELS ?? "")
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
  const model = process.env.LOGFARE_MODEL?.trim() || DEFAULT_MODEL;
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

// Read the rejected option from the diagnostic, not a list of model quirks.
// Only optional fields are in `fields`; model and messages cannot be removed.
function rejectedField(detail: string, fields: Record<string, unknown>) {
  let param: unknown;
  let code: unknown;
  let message = detail;
  try {
    const body = JSON.parse(detail);
    const error = body?.error ?? body;
    param = error?.param;
    code = error?.code;
    if (typeof error === "string") message = error;
    else if (typeof error?.message === "string") message = error.message;
  } catch { /* Some gateways send plain text. */ }
  // E.g. "Invalid parameter: 'x'", "Invalid value for parameter `x`",
  // or "Parameter 'x' is not supported". Other options mentioned in the
  // explanation (such as a suggested replacement) aren't the rejected one.
  const named = message.match(/\b(?:invalid|unsupported|unknown|unrecognized|unexpected)\s+(?:parameter|argument|field|keyword argument|value(?:\s+for(?:\s+(?:parameter|argument|field))?)?)\b\s*[:=]?\s*['"`]?([a-z_]\w*(?:\.\w+)*)/i)
    ?? message.match(/\b([a-z_]\w*(?:\.\w+)*)['"`]?\s+(?:(?:is|was)\s+)?(?:invalid|unsupported|not supported|not allowed|unrecognized)\b/i)
    ?? message.match(/\bdoes not support\s+(?:the\s+)?(?:parameter\s+)?['"`]?([a-z_]\w*(?:\.\w+)*)/i);
  const invalid = named || /invalid|unsupported|not supported|unrecognized|only the default/i.test(message) ||
    code === "unsupported_parameter" || code === "unsupported_value";
  if (!invalid) return;
  const path = typeof param === "string" && param ? param : named?.[1];
  const name = path?.split(".")[0];
  if (!name || !Object.hasOwn(fields, name)) return;
  // A bad value doesn't mean the field is unsupported for future requests.
  return { name, remember: code === "unsupported_parameter" || /\b(?:unsupported|unknown) parameter\b/i.test(message) };
}

async function performRequest(
  config: ModelConfig,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions,
  timeoutMs: number,
): Promise<CallResult> {
  const began = Date.now();
  const key = modelKey(config, model);
  const fields: Record<string, unknown> = {
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 8000,
  };
  if (config.disableThinking) fields.chat_template_kwargs = { enable_thinking: false };
  if (config.reasoningEffort) fields.reasoning = { effort: config.reasoningEffort };
  for (const name of unsupportedFields.get(key) ?? []) {
    delete fields[name];
  }

  // Each compatibility retry removes a present field and shares the deadline.
  const signal = AbortSignal.timeout(timeoutMs);
  for (;;) {
    const started = Date.now();
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model, messages, ...fields }),
      signal,
    });

    if (process.env.LOGFARE_DEBUG === "true") {
      console.warn(
        `[clickpoint] ${model} responded ${response.status} in ${
          Date.now() - started
        }ms (timeout ${timeoutMs}ms, max_tokens ${
          options.maxTokens ?? 8000
        }, thinking ${fields.chat_template_kwargs ? "off" : "default"}).`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = `Logfare ${response.status} on ${model}: ${
        detail.slice(0, 300) || response.statusText
      }`;
      if (response.status === 400 || response.status === 422) {
        const rejected = rejectedField(detail, fields);
        if (rejected) {
          const { name, remember } = rejected;
          if (remember) {
            const known = unsupportedFields.get(key) ?? new Set<string>();
            known.add(name);
            unsupportedFields.set(key, known);
          }
          delete fields[name];
          continue;
        }
      }
      // Permanent model failures leave this call's chain; shared request or
      // credential errors must not be retried against every configured model.
      return {
        ok: false,
        model,
        status: response.status,
        action: failureAction(response.status, detail),
        error,
        elapsedMs: Date.now() - began,
      };
    }

    const data = (await response.json()) as LogfareResponse;
    /* Only the answer field. `reasoning_content` is the model THINKING, not
       its reply — measured on kimi-k2.7-code and glm, where it holds "We
       need act as correctness reviewer…" and no JSON at all. Feeding that to
       a JSON parser turns one failed call into four doubled parse retries,
       per section, per card. An empty answer stays empty, and the fallback
       chain handles it. */
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
        action: "retry",
        error: `Logfare returned no text from ${servedBy}${detail}.`,
        elapsedMs: Date.now() - began,
      };
    }

    return { ok: true, content, model: servedBy };
  }
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
      action: "retry",
      error: `Logfare request failed on ${model}: ${message}`,
      elapsedMs: Date.now() - began,
    };
  }
}

export async function chat(messages: ChatMessage[], options: ChatOptions = {}) {
  const config = getConfig();
  /* A per-call effort wins over the deployment default. "none" is real: the
     provider advertises it, and it is the difference between a visual that
     arrives in 18s and one that burns the budget reasoning and returns "". */
  if (options.reasoningEffort !== undefined) {
    config.reasoningEffort = options.reasoningEffort;
  }
  /* An explicit model leads the chain; the configured default remains the
     fallback so a bad model name degrades instead of failing the card. */
  const primary = options.model?.trim() || config.model;
  const chain = [
    primary,
    ...config.fallbacks.filter((name) => name !== primary),
    ...(primary === config.model ? [] : [config.model]),
  ];
  const now = Date.now();
  const candidates: string[] = [];
  const cooling: string[] = [];
  for (const model of chain) {
    const until = unavailableUntil.get(modelKey(config, model)) ?? 0;
    (until > now ? cooling : candidates).push(model);
  }
  candidates.push(...cooling);

  // Tokens actually wanted. It starts at the caller's budget, grows when a
  // failure looks like truncation, and shrinks when a failure looks like a
  // gateway cutoff — a retry after a 100s+ 503 asks for roughly half as much,
  // plus a brevity nudge in the prompt, instead of twice as much. It carries
  // across models: a cutoff on the primary tells the fallback to stay small.
  let wantedTokens = options.maxTokens ?? 8000;
  let shrink = false;

  let attempt = 0;
  let modelIndex = 0;
  for (;;) {
    const model = candidates[modelIndex];

    const attemptOptions: ChatOptions = {
      ...options,
      // Never shrink below what the caller asked for: on a reasoning model
      // that floor is what pays for the hidden reasoning, and dropping under
      // it guarantees an empty answer. The brevity nudge below is the real
      // lever on a retry, since a smaller task needs less thinking.
      maxTokens: shrink
        ? options.keepStructure
          /* Same envelope, same room to close the JSON: only the prose gets
             tighter, never the budget, or the retry truncates again. */
          ? options.maxTokens ?? wantedTokens
          : Math.max(
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
      unavailableUntil.delete(modelKey(config, model));
      if (attempt > 0 || shrink) {
        console.warn(
          `[clickpoint] ${result.model} answered after ${attempt} retries.`,
        );
      }
      return result.content;
    }

    attempt += 1;
    if (result.action === "fatal") throw new Error(result.error);
    if (chain.length > 1 && result.action !== "incompatible") {
      unavailableUntil.set(modelKey(config, model), Date.now() + MODEL_COOLDOWN_MS);
    }
    if (result.action === "retry") modelIndex += 1;
    else candidates.splice(modelIndex, 1);
    if (!candidates.length) throw new Error(result.error);
    if (options.maxAttempts && attempt >= options.maxAttempts) {
      throw new Error(`Gave up after ${attempt} attempts: ${result.error}`);
    }

    const cutoff =
      result.elapsedMs >= GATEWAY_CUTOFF_MS ||
      /timed out after/.test(result.error);
    if (cutoff) {
      // The gateway cut generation off. Remember a smaller budget and ask
      // the model to be tight; do not inflate the retry.
      shrink = true;
      wantedTokens = attemptOptions.maxTokens ?? wantedTokens;
    } else if (/returned no text.*finish_reason: length/i.test(result.error)) {
      /* Budget spent with NOTHING visible. This is the reasoning-eats-the-
         envelope failure, not a too-small answer: a longer envelope gives the
         hidden thinking more room to do the same thing again. Ask for less so
         the model has to get to the point. */
      shrink = true;
      wantedTokens = Math.max(2000, Math.floor(wantedTokens / 2));
    } else if (
      /finish_reason: length|incomplete JSON|returned no text/i.test(
        result.error,
      )
    ) {
      // A real answer that ran dry. More headroom may genuinely help.
      shrink = false;
      wantedTokens = Math.min(wantedTokens * 2, MAX_TOKEN_CEILING);
    }

    // Try each remaining candidate immediately. Back off only before a
    // second pass through models that failed transiently.
    const endOfPass = modelIndex === candidates.length;
    if (endOfPass) modelIndex = 0;
    let delay = 0;
    if (endOfPass) {
      delay = result.status === 429
        ? 4000 + Math.floor(Math.random() * 4000)
        : RETRY_BASE_DELAY_MS * 2 ** Math.min(attempt - 1, MAX_BACKOFF_EXPONENT) +
          Math.floor(Math.random() * 250);
    }
    console.warn(
      `[clickpoint] ${result.error}${
        cutoff ? " Asking for a tighter regeneration." : ""
      } Retry #${attempt} on ${candidates[modelIndex]} in ${delay}ms.`,
    );
    if (delay) await sleep(delay);
  }
}


/* The reviewer: a different model reads the assembled card and reports
   what is factually wrong. Separate from the writer for the same reason a
   code review is separate from authorship — the model that produced a
   number is the worst judge of it. Falls back to the content model. */
export function reviewModel(): string | undefined {
  const name = (process.env.LOGFARE_REVIEW_MODEL || "").trim();
  return name || undefined;
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
