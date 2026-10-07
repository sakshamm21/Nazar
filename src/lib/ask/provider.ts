import "server-only";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * The one place Ask gets a model from. Everything that calls a model (the answer, the scope guard)
 * goes through here, so tests and evals can put a scripted model in its place and run the real
 * request path with no key and no network.
 */
type ModelFactory = (id: string) => LanguageModel;

const state = globalThis as unknown as { __nazarModels?: ModelFactory | null };

export const languageModel = (id: string): LanguageModel => (state.__nazarModels ?? openai)(id);

/** Tests: answer every model request from `factory`. Pass null to go back to the real provider. */
export function setModelsForTests(factory: ModelFactory | null) {
  state.__nazarModels = factory;
}

/** Whether Ask can run at all: a key is set, or a test has supplied its own models. */
export const askConfigured = () => Boolean(state.__nazarModels) || Boolean(process.env.OPENAI_API_KEY);
