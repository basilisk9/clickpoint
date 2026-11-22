import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat } from "./ai";

const messages = [{ role: "user" as const, content: "Explain the result." }];
const fetchMock = vi.fn<typeof fetch>();
const answer = { choices: [{ message: { content: "ready" } }] };
let endpoint = 0;

function requests() {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

function unsupported(param: string) {
  return Response.json({ error: {
    message: `Unsupported parameter: '${param}' is not supported with this model.`,
    type: "invalid_request_error", param, code: null,
  } }, { status: 400 });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("LOGFARE_API_KEY", "test-key");
  // Each provider has independent availability and parameter support.
  vi.stubEnv("LOGFARE_BASE_URL", `https://provider-${++endpoint}.test/v1`);
  vi.stubEnv("LOGFARE_MODEL", "primary");
  vi.stubEnv("LOGFARE_FALLBACK_MODELS", "backup, primary, backup, , last");
  vi.stubEnv("LOGFARE_REASONING_EFFORT", "low");
  vi.stubEnv("LOGFARE_DISABLE_THINKING", "true");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Model routing", () => {
  it("recovers from a temperature 400 on the chosen model without dropping other settings", async () => {
    fetchMock.mockResolvedValueOnce(unsupported("temperature"))
      .mockImplementation(async () => Response.json(answer));
    await expect(chat(messages, { maxAttempts: 1, temperature: 0.2 })).resolves.toBe("ready");
    await chat(messages);
    await chat(messages, { model: "backup", temperature: 0.5 });
    const [original, retry, next, other] = requests();
    const { temperature, ...rest } = original;
    expect(temperature).toBe(0.2);
    expect(retry).toEqual(rest);
    expect(next).not.toHaveProperty("temperature");
    expect(other).toMatchObject({ model: "backup", temperature: 0.5 });
  });

  it("removes exactly the named options from successive message-only errors", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "Invalid parameter: `reasoning.effort`. Keep temperature as supplied." } }, { status: 400 }))
      .mockResolvedValueOnce(new Response("Parameter 'chat_template_kwargs' is not supported", { status: 422 }))
      .mockResolvedValueOnce(new Response("Invalid value for parameter 'max_tokens': exceeds this model's limit", { status: 400 }))
      .mockResolvedValueOnce(Response.json(answer));
    await expect(chat(messages, { maxAttempts: 1, maxTokens: 1800 })).resolves.toBe("ready");
    const [first, second, third, fourth] = requests();
    const { reasoning, ...withoutReasoning } = first;
    expect(reasoning).toBeDefined();
    expect(second).toEqual(withoutReasoning);
    const { chat_template_kwargs, ...withoutHint } = second;
    expect(chat_template_kwargs).toBeDefined();
    expect(third).toEqual(withoutHint);
    expect(fourth).toEqual({ model: "primary", messages, temperature: 0.4 });
  });

  it("does not remove a suggested option when the rejected field was never sent", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Invalid parameter: 'temp'. Did you mean 'temperature'?", { status: 400 }));
    await expect(chat(messages)).rejects.toThrow(/Invalid parameter: 'temp'/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses ordered, distinct backups; later calls skip failed models until cooldown expires", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response("model not found", { status: 404 }))
      .mockImplementation(async () => Response.json(answer));
    await expect(chat(messages)).resolves.toBe("ready");
    await chat(messages);
    vi.setSystemTime(Date.now() + 61_000);
    await chat(messages);
    expect(requests().map((r) => r.model)).toEqual(["primary", "backup", "last", "last", "primary"]);
  });

  it("stops once every model is permanently unavailable", async () => {
    fetchMock.mockImplementation(async () => new Response("daily limit reached", { status: 429 }));
    await expect(chat(messages)).rejects.toThrow(/429 on last/);
    expect(requests().map((r) => r.model)).toEqual(["primary", "backup", "last"]);
  });

  it("does not cycle through backups for invalid credentials or malformed messages", async () => {
    fetchMock.mockResolvedValueOnce(new Response("invalid API key", { status: 401 }))
      .mockResolvedValueOnce(new Response("messages must not be empty", { status: 400 }));
    await expect(chat(messages)).rejects.toThrow(/401 on primary/);
    await expect(chat([])).rejects.toThrow(/400 on primary/);
    expect(requests().map((r) => r.model)).toEqual(["primary", "primary"]);
  });
});
