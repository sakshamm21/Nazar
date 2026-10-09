/**
 * What Nazar measured about each Ask model, for the model picker in Settings. Client-safe.
 *
 * These are estimates from Nazar's own test questions (`npm run eval:agent`, 7 and 8 October 2026),
 * shown so a choice can be made on evidence. They describe; they do not decide: which model answers
 * is the user's pick, or the Auto routing in models.ts, and nothing here feeds that routing.
 *
 * Not every model sat the same test, so each figure says what it was measured on.
 */
export type ModelStats = {
  /** Test questions passed, and out of how many. Null when the model was never run on answers. */
  passed: number | null;
  outOf: number | null;
  /** Which test that was, in a few words. */
  testedOn: string;
  /** Median seconds to the first word of an answer, including the topic check. */
  firstWordSeconds: number | null;
  /** US dollars for a thousand ordinary answers, from token counts and list prices. */
  usdPer1000Answers: number | null;
  /** One line a person choosing should know. */
  note?: string;
};

export const MODEL_STATS: Record<string, ModelStats> = {
  "openai/gpt-6-luna": { passed: 92, outOf: 93, testedOn: "all questions, three runs", firstWordSeconds: 4.4, usdPer1000Answers: 0.3, note: "What Auto uses for everything except a deep dive." },
  "z-ai/glm-5.3-flash": { passed: 90, outOf: 93, testedOn: "all questions, one run", firstWordSeconds: 10.5, usdPer1000Answers: 1.5 },
  "deepseek/deepseek-v4-pro-0813": { passed: 89, outOf: 93, testedOn: "all questions, one run", firstWordSeconds: 6.7, usdPer1000Answers: 3.2 },
  "deepseek/deepseek-v4.1-flash": { passed: 81, outOf: 93, testedOn: "all questions, one run, before six portfolio questions could be passed", firstWordSeconds: 3.8, usdPer1000Answers: 1.0 },
  "openai/gpt-6-sol": { passed: 18, outOf: 18, testedOn: "company questions only, one run", firstWordSeconds: 9.8, usdPer1000Answers: 11, note: "What Auto uses for a deep dive: about 20 seconds to start and $0.03 a report." },
  "anthropic/claude-sonnet-5.5": { passed: 14, outOf: 18, testedOn: "company questions only, one run", firstWordSeconds: 13.9, usdPer1000Answers: 76, note: "Its four misses were answers longer than Simple mode allows." },
  "openai/gpt-4.1-mini": { passed: null, outOf: null, testedOn: "not tested on answers; it runs the topic check", firstWordSeconds: null, usdPer1000Answers: null },
};

/** What Auto amounts to, in the same terms. */
export const AUTO_STATS: ModelStats = { passed: 100, outOf: 100, testedOn: "all 100 questions on 9 October, three runs", firstWordSeconds: 4.9, usdPer1000Answers: 0.3, note: "GPT-6 Luna for ordinary questions, GPT-6 Sol when you ask for a deep dive or a full report." };

export const statsFor = (id: string): ModelStats | null => MODEL_STATS[id] ?? null;
