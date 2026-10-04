/**
 * The goals form's own rules: what it accepts, what it refuses, and the payload it sends. The form
 * and the API both rely on these, so they are tested once, here, rather than through the component.
 */
import { describe, expect, it } from "vitest";
import { emptyDraft, goalPayload, progressDraft, progressPayload, today, type GoalDraft } from "@/lib/goals/draft";

const draft = (patch: Partial<GoalDraft> = {}): GoalDraft => ({ ...emptyDraft(), name: "House deposit", target: "2500000", byDate: "2030-06-30", savedAsOf: "2025-01-01", ...patch });

describe("what the goals form will accept", () => {
  it("builds a payload from a complete draft", () => {
    const p = goalPayload(draft({ saved: "1,50,000", monthly: "20000", ratePct: "7" }));
    expect(p).toEqual({ ok: true, body: { name: "House deposit", target: 2500000, byDate: "2030-06-30", saved: 150000, savedAsOf: "2025-01-01", monthly: 20000, ratePct: 7 } });
  });

  it("treats an empty saved amount as nothing saved yet", () => {
    const p = goalPayload(draft());
    expect(p.ok && p.body.saved).toBe(0);
  });

  it("reads numbers written the way India writes them", () => {
    const p = goalPayload(draft({ target: "25,00,000", monthly: "20,000" }));
    expect(p.ok && p.body.target).toBe(2500000);
    expect(p.ok && p.body.monthly).toBe(20000);
  });

  it.each([
    ["no name", { name: "  " }, /name/i],
    ["no amount", { target: "" }, /amount/i],
    ["an amount of zero", { target: "0" }, /amount/i],
    ["a date in the past is allowed — the goal simply reads as passed", { byDate: "2000-01-01" }, null],
    ["negative savings", { saved: "-1" }, /negative/i],
    ["a negative monthly amount", { monthly: "-500" }, /negative/i],
    ["a rate above 40%", { ratePct: "60" }, /between 0 and 40/i],
    ["a negative rate", { ratePct: "-3" }, /between 0 and 40/i],
    ["text where a number belongs", { target: "a lot" }, /amount/i],
  ])("%s", (_label, patch, expected) => {
    const p = goalPayload(draft(patch as Partial<GoalDraft>));
      if (!expected) {
        expect(p.ok).toBe(true);
        return;
      }
      expect(p.ok).toBe(false);
      if (!p.ok) expect(p.error).toMatch(expected);
    });

  it("a name longer than the column allows is trimmed rather than refused", () => {
    const p = goalPayload(draft({ name: "A".repeat(200) }));
    expect(p.ok && p.body.name).toHaveLength(60);
  });
  });

  describe("the progress form", () => {
    it("starts from the goal's own last recorded figures", () => {
      expect(progressDraft(150000, "2025-03-31")).toMatchObject({ saved: "150000", savedAsOf: "2025-03-31" });
  });

    it("falls back to today when the goal has never been measured", () => {
      expect(progressDraft(0, null).savedAsOf).toBe(today());
      expect(progressDraft(0, null).saved).toBe("");
    });

    it("sends only the two numbers progress needs", () => {
      // Regression: reusing goalPayload here demanded a name and a target the sheet has no field for,
      // so recording progress always failed with "Give the goal a name".
      const p = progressPayload(progressDraft(0, null));
      expect(p).toEqual({ ok: true, body: { saved: 0, savedAsOf: today() } });
      expect(p.ok && Object.keys(p.body).sort()).toEqual(["saved", "savedAsOf"]);
    });

    it("reads the amount the way India writes it", () => {
      expect(progressPayload({ ...progressDraft(0, null), saved: "5,00,000" })).toEqual({ ok: true, body: { saved: 500000, savedAsOf: today() } });
    });

    it("refuses a negative amount, and says so", () => {
      const p = progressPayload({ ...progressDraft(0, null), saved: "-1" });
      expect(p.ok).toBe(false);
      expect(p.ok === false && p.error).toMatch(/negative/i);
    });

    it("refuses a negative amount written with commas", () => {
      const p = progressPayload({ ...progressDraft(0, null), saved: "-1,000" });
      expect(p.ok).toBe(false);
    });
  });