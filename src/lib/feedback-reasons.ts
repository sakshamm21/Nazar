/** Reasons offered after a 👎 — shared by the API (validation) and the UI (labels). */
export const FEEDBACK_REASONS = {
  wrong_data: "Data looks wrong",
  not_helpful: "Didn't help",
  too_long: "Too long",
  too_complex: "Too complex",
  missed_question: "Missed my question",
  other: "Other",
} as const;
export type FeedbackReason = keyof typeof FEEDBACK_REASONS;
