import "server-only";
import { createOpenAI, openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { ModelVia } from "./models";

/**
 * The one place Ask gets a model from. Everything that calls a model (the answer, the scope guard,
 * the eval judges) goes through here, so tests and evals can put a scripted model in its place and
 * run the real request path with no key and no network.
 *
 * With OPENROUTER_API_KEY set, every model is reached through OpenRouter, which speaks OpenAI's
 * chat-completions format and so needs no SDK of its own. Without it, Ask falls back to OpenAI
 * directly with OPENAI_API_KEY, as it always has.
 */
type ModelFactory = (id: string) => LanguageModel;

const state = globalThis as unknown as { __nazarModels?: ModelFactory | null; __nazarOpenRouter?: ReturnType<typeof createOpenAI>; __nazarOpenRouterKey?: string };

export const OPENROUTER_URL = "https://openrouter.ai/api/v1";

/** Which provider real requests go to. */
export const activeProvider = (): ModelVia => (process.env.OPENROUTER_API_KEY ? "openrouter" : "openai");

function openRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY!;
  if (!state.__nazarOpenRouter || state.__nazarOpenRouterKey !== apiKey) {
    state.__nazarOpenRouterKey = apiKey;
    // The two headers name the app on OpenRouter's side; they carry nothing about the user.
    state.__nazarOpenRouter = createOpenAI({ name: "openrouter", baseURL: OPENROUTER_URL, apiKey, headers: { "HTTP-Referer": process.env.APP_URL || "https://nazar-watch.vercel.app", "X-Title": "Nazar" } });
  }
  return state.__nazarOpenRouter;
}

export function languageModel(id: string): LanguageModel {
  if (state.__nazarModels) return state.__nazarModels(id);
  return activeProvider() === "openrouter" ? openRouter().chat(id) : openai(id);
}

/** Tests: answer every model request from `factory`. Pass null to go back to the real provider. */
export function setModelsForTests(factory: ModelFactory | null) {
  state.__nazarModels = factory;
}

/** Whether Ask can run at all: a key is set, or a test has supplied its own models. */
export const askConfigured = () => Boolean(state.__nazarModels) || Boolean(process.env.OPENROUTER_API_KEY) || Boolean(process.env.OPENAI_API_KEY);
