import "server-only";
import { goalXirr, projectGoal, type Projection } from "@/lib/portfolio/goals";
import { istDate } from "@/lib/data/provider";
import { listGoals, type Goal } from "@/lib/repo/goals";

export type GoalRow = {
  goal: Goal;
  /** Where the plan stands against the target, worked out from today's date. */
  projection: Projection;
  /** What the recorded instalments have actually returned, when there are enough of them. */
  xirr: number | null;
  /** Plain-language status: what a reader needs to know, not a judgement. */
  tone: "gain" | "accent" | "neutral" | "warn" | "loss";
  status: string;
};

const STATUS: Record<Projection["status"], { label: string; tone: GoalRow["tone"] }> = {
  met: { label: "Reached", tone: "gain" },
  ahead: { label: "Ahead of the plan", tone: "gain" },
  "on-track": { label: "On track", tone: "accent" },
  behind: { label: "Behind the plan", tone: "warn" },
  "at-risk": { label: "Not enough at this pace", tone: "loss" },
  "no-plan": { label: "No monthly amount yet", tone: "neutral" },
  expired: { label: "The date has passed", tone: "loss" },
};

/**
 * Every goal, with what each one requires and where it stands. The growth rate the user entered is
 * the only one used, and it is labelled as their own assumption wherever it appears.
 */
export async function goalsView(userId: string) {
  const goals = await listGoals(userId);
  const today = istDate(new Date());
  const rows: GoalRow[] = goals.map((goal) => {
    const projection = projectGoal({ target: goal.target, byDate: goal.byDate, saved: goal.saved, savedAsOf: goal.savedAsOf, monthly: goal.monthly }, today, goal.ratePct ?? 0);
    const s = STATUS[projection.status];
    return { goal, projection, xirr: goalXirr({ target: goal.target, byDate: goal.byDate, saved: goal.saved, savedAsOf: goal.savedAsOf, monthly: goal.monthly }, today), tone: s.tone, status: s.label };
  });
  const planned = rows.filter((r) => r.projection.status !== "expired");
  // One number for the card header: how much still has to be put away across every live goal.
  const toGo = planned.reduce((a, r) => a + r.projection.toGo, 0);
  const monthly = planned.reduce((a, r) => a + Math.max(r.goal.monthly ?? 0, 0), 0);
  return { rows, toGo, monthly, behind: rows.filter((r) => r.projection.status === "behind" || r.projection.status === "at-risk").length };
}

export type GoalsView = Awaited<ReturnType<typeof goalsView>>;