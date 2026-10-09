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

const state = globalThis as unknown as { __nazarModels?: ModelFactory | null; __nazarOpenRouter?: ReturnType<typeof createOpenAI>; __nazarOpenRouterKey?: string; __nazarSelfHosted?: ReturnType<typeof createOpenAI>; __nazarSelfHostedUrl?: string };

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

/**
 * A server of the deployment's own, for models whose weights are public.
 *
 * Through OpenRouter a question goes to OpenRouter and to whichever company hosts the model. An
 * open-weight model can instead be run on a machine the deployer controls (vLLM, Ollama, llama.cpp
 * and the like all speak the same chat-completions format), and then a question leaves Nazar for
 * nowhere else. Set:
 *
 *   SELF_HOSTED_BASE_URL   the server's OpenAI-compatible endpoint, e.g. http://10.0.0.5:8000/v1
 *   SELF_HOSTED_MODELS     which catalog models it serves, and under what name there:
 *                          "z-ai/glm-5.3-flash=glm-5.3-flash,deepseek/deepseek-v4.1-flash"
 *   SELF_HOSTED_API_KEY    if the server wants one
 *
 * Only models named there go to that server; every other model goes where it always did. To keep
 * every call in house, also point Auto and the topic check at such a model (ASK_AUTO_MODEL,
 * GUARD_MODEL) and narrow the picker to them (ALLOWED_MODELS).
 */
export function selfHostedModels(): Map<string, string> {
  const out = new Map<string, string>();
  if (!process.env.SELF_HOSTED_BASE_URL) return out;
  for (const part of (process.env.SELF_HOSTED_MODELS ?? "").split(",")) {
    const [id, name] = part.split("=").map((s) => s.trim());
    if (id) out.set(id, name || id);
  }
  return out;
}

function selfHosted() {
  const url = process.env.SELF_HOSTED_BASE_URL!;
  if (!state.__nazarSelfHosted || state.__nazarSelfHostedUrl !== url) {
    state.__nazarSelfHostedUrl = url;
    state.__nazarSelfHosted = createOpenAI({ name: "self-hosted", baseURL: url, apiKey: process.env.SELF_HOSTED_API_KEY || "none" });
  }
  return state.__nazarSelfHosted;
}

export function languageModel(id: string): LanguageModel {
  if (state.__nazarModels) return state.__nazarModels(id);
  // A run that must not spend (the browser tests' own server) refuses here, at the one door every
  // model call goes through. The topic check and import help both treat a failure as "no answer".
  if (process.env.NAZAR_NO_MODEL_CALLS === "1") throw new Error("Model calls are switched off for this run (NAZAR_NO_MODEL_CALLS=1).");
  const own = selfHostedModels().get(id);
  if (own) return selfHosted().chat(own);
  return activeProvider() === "openrouter" ? openRouter().chat(id) : openai(id);
}

/** Tests: answer every model request from `factory`. Pass null to go back to the real provider. */
export function setModelsForTests(factory: ModelFactory | null) {
  state.__nazarModels = factory;
}

/** Whether Ask can run at all: a key is set, or a test has supplied its own models. */
export const askConfigured = () => Boolean(state.__nazarModels) || Boolean(process.env.OPENROUTER_API_KEY) || Boolean(process.env.OPENAI_API_KEY) || selfHostedModels().size > 0;
