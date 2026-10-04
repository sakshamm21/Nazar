import { z } from "zod";

/** How many goals one account may track. Kept here so the form and the repository agree. */
export const MAX_GOALS = 8;

/**
 * Shared input rules for the goals endpoints. Every field carries a message the user can act on,
 * because the API answers with the first one it finds — the form's own checks are a convenience,
 * this is what actually protects the data.
 */
const day = z
  .string({ error: "Use a valid date, like 2030-06-30." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date, like 2030-06-30.");
const amount = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .min(0, `${label} cannot be below zero.`)
    .max(1e12, `${label} is larger than any goal would need.`);

export const GoalBody = z.object({
  name: z.string({ error: "Give the goal a name." }).trim().min(1, "Give the goal a name.").max(60, "Keep the name to 60 characters."),
  target: z.number({ error: "The amount must be a number." }).positive("The amount must be more than zero.").max(1e12, "That amount is larger than any goal would need."),
  byDate: day,
  // Optional rather than defaulted on purpose: a default here would let a PATCH that changed only
  // the monthly amount quietly reset the goal's savings to zero.
  saved: amount("What is saved").optional(),
  savedAsOf: day.nullable().optional(),
  monthly: amount("The monthly amount").nullable().optional(),
  ratePct: z.number({ error: "The rate must be a number." }).min(0, "The rate cannot be below zero.").max(40, "That rate is higher than any assumption worth making.").nullable().optional(),
  icon: z.string({ error: "The icon must be text." }).trim().max(24, "Keep the icon short.").nullable().optional(),
});

export const GoalPatch = GoalBody.partial();

/** Progress is just the two numbers that change as the months go by. */
export const GoalProgressBody = z.object({ saved: amount("What is saved"), savedAsOf: day });