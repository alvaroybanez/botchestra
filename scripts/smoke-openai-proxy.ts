import { generateWithModel } from "../packages/ai/src/index";

const baseURL = process.env.OPENAI_BASE_URL;
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("OPENAI_API_KEY is not set");
  process.exit(1);
}

console.log(`base URL: ${baseURL ?? "(default https://api.openai.com/v1)"}`);
console.log(`api key : ${apiKey.slice(0, 6)}…${apiKey.slice(-4)} (${apiKey.length} chars)`);

const started = Date.now();
try {
  const result = await generateWithModel("summarization", {
    prompt: "Reply with a single word: pong",
  });
  console.log(`elapsed : ${Date.now() - started}ms`);
  console.log(`model   : ${(result as { response?: { modelId?: string } }).response?.modelId ?? "(unknown)"}`);
  console.log(`text    : ${result.text}`);
  process.exit(0);
} catch (error) {
  console.error(`FAILED after ${Date.now() - started}ms`);
  console.error(error);
  process.exit(1);
}
