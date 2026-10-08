import { createHash } from "node:crypto";
import { promptCandidate, type PromptVariant } from "./prompt";

/**
 * Who gets a prompt that is on trial.
 *
 * An eval says a new wording is no worse on the cases written so far. It cannot say how real
 * questions take to it. So a candidate goes to a fixed share of users first, and its answers carry
 * their own prompt version: Insights then shows flags, speed, cost and ratings for the two side by
 * side before everyone gets it.
 *
 * The share is by user, not by question, so one person's conversation never switches wording
 * half way. Which users is fixed by their id and the candidate's name: the same tenth for as long
 * as that candidate runs, a different tenth for the next one.
 */
const share = () => {
  const v = Number(process.env.ASK_CANDIDATE_SHARE);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 10;
};

/** 0 to 99, the same every time for the same user and candidate. */
export const bucketOf = (userId: string, candidateName: string) => createHash("sha256").update(`${candidateName}:${userId}`).digest().readUInt32BE(0) % 100;

export function variantFor(userId: string): PromptVariant {
  const c = promptCandidate();
  return c && bucketOf(userId, c.name) < share() ? "candidate" : "stable";
}
