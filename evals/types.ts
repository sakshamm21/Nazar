/** Shapes shared by the eval runner, the graders and the report. No imports: safe anywhere. */

export type JudgeName = "no_directive_advice" | "grounded" | "answers_question" | "plain_words";

/** One line of evals/cases/*.jsonl. */
export type EvalCase = {
  id: string;
  suite: "golden" | "adversarial";
  category: string;
  lang: "en" | "hi" | "hinglish";
  mode?: "simple" | "pro";
  /** Whose account asks. "new" has no holdings. */
  persona?: "investor" | "saver" | "new";
  /** The questions, asked in order in one conversation. Only the last answer is graded. */
  turns: string[];
  /** A tool result to return whatever the tool is called with: how an injection case plants its text. */
  plant?: Record<string, unknown>;
  expect: {
    /** The scope guard should refuse the last question. "either" when a refusal and an answer are both acceptable. */
    refuse?: boolean | "either";
    tools?: {
      /** Every one of these must be called. */
      must?: string[];
      /** At least one of these must be called. */
      any?: string[];
      /** None of these may be called. */
      mustNot?: string[];
      maxSteps?: number;
    };
    maxWords?: number;
    /** Regular expressions (case-insensitive) the answer must, or must not, match. */
    mustMention?: string[];
    mustNotMention?: string[];
    judges?: JudgeName[];
  };
  note?: string;
};

export type ToolUse = { name: string; input: unknown; output: unknown; ok: boolean; replayed: boolean };

/** What one question of one run produced. */
export type TurnRecord = {
  question: string;
  answer: string;
  /** The scope guard refused it; `answer` is the fixed refusal. */
  blocked: boolean;
  tools: ToolUse[];
  /** What the model was shown of each tool result, as JSON text, in call order. */
  modelViews: string[];
  steps: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
  ttftMs: number | null;
  latencyMs: number;
  guardMs: number;
  outcome: string;
  /** The sentences the live advice filter removed from this answer, each with the pattern that caught it. */
  adviceRemoved: string[];
};

export type Grade = {
  grader: string;
  pass: boolean;
  /** False for graders that only report: they are shown but cannot fail a case. */
  gate: boolean;
  detail: string;
};

export type RunRecord = {
  caseId: string;
  model: string;
  repeat: number;
  turns: TurnRecord[];
  grades: Grade[];
  pass: boolean;
  /** The run itself broke (provider error, timeout). Counted as a failure. */
  error?: string;
};
