import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createOpenAI = vi.fn();
const openaiDefault = vi.fn();
const generateText = vi.fn();

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (opts: unknown) => {
    createOpenAI(opts);
    const factory = vi.fn((modelId: string) => ({ modelId, source: "createOpenAI" }));
    return factory;
  },
  openai: (...args: unknown[]) => {
    openaiDefault(...args);
    return { modelId: args[0], source: "default" };
  },
}));

vi.mock("ai", () => ({
  generateText: (opts: unknown) => {
    generateText(opts);
    return Promise.resolve({ text: "ok" });
  },
  streamText: vi.fn(),
}));

const PROXY_URL = "https://platform.genai.olx.io/proxy/openai/v1";

describe("resolveProvider (via generateWithModel)", () => {
  beforeEach(() => {
    createOpenAI.mockClear();
    openaiDefault.mockClear();
    generateText.mockClear();
    delete process.env.OPENAI_BASE_URL;
  });

  afterEach(() => {
    delete process.env.OPENAI_BASE_URL;
  });

  it("uses the default openai provider when neither apiKey nor baseURL is provided", async () => {
    const { generateWithModel } = await import("./index");
    await generateWithModel("action", { prompt: "hello" });
    expect(createOpenAI).not.toHaveBeenCalled();
    expect(openaiDefault).toHaveBeenCalledOnce();
  });

  it("passes apiKey to createOpenAI when provided", async () => {
    const { generateWithModel } = await import("./index");
    await generateWithModel("action", { prompt: "hello", apiKey: "sk-test" });
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "sk-test" });
  });

  it("passes baseURL to createOpenAI when provided explicitly", async () => {
    const { generateWithModel } = await import("./index");
    await generateWithModel("action", {
      prompt: "hello",
      apiKey: "sk-test",
      baseURL: PROXY_URL,
    });
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "sk-test", baseURL: PROXY_URL });
  });

  it("falls back to OPENAI_BASE_URL env var when no explicit baseURL is passed", async () => {
    process.env.OPENAI_BASE_URL = PROXY_URL;
    const { generateWithModel } = await import("./index");
    await generateWithModel("action", { prompt: "hello" });
    expect(createOpenAI).toHaveBeenCalledWith({ baseURL: PROXY_URL });
  });

  it("prefers an explicit baseURL over OPENAI_BASE_URL env var", async () => {
    process.env.OPENAI_BASE_URL = "https://env.example.com/v1";
    const explicit = "https://explicit.example.com/v1";
    const { generateWithModel } = await import("./index");
    await generateWithModel("action", { prompt: "hello", baseURL: explicit });
    expect(createOpenAI).toHaveBeenCalledWith({ baseURL: explicit });
  });

  it("strips apiKey and baseURL from the args forwarded to generateText", async () => {
    const { generateWithModel } = await import("./index");
    await generateWithModel("action", {
      prompt: "hello",
      apiKey: "sk-test",
      baseURL: PROXY_URL,
    });
    const forwarded = generateText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(forwarded).not.toHaveProperty("apiKey");
    expect(forwarded).not.toHaveProperty("baseURL");
    expect(forwarded).not.toHaveProperty("modelOverride");
    expect(forwarded).not.toHaveProperty("stream");
  });
});
