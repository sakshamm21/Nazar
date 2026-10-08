/** A prompt on trial: who gets it, and that nobody does when there is none. */
import { afterEach, describe, expect, it } from "vitest";
import { setCandidateForTests, systemPrompt } from "@/lib/ask/prompt";
import { promptVersion } from "@/lib/ask/prompt-version";
import { bucketOf, variantFor } from "@/lib/ask/rollout";

const users = Array.from({ length: 2000 }, (_, i) => `user-${i}`);
const trial = { name: "shorter-style", rewrite: (stable: string) => `${stable}\n- Lead with the number.` };

afterEach(() => {
  setCandidateForTests(null);
  delete process.env.ASK_CANDIDATE_SHARE;
});

describe("with no prompt on trial", () => {
  it("everyone gets the stable prompt, under one version", () => {
    expect(users.every((u) => variantFor(u) === "stable")).toBe(true);
    expect(systemPrompt("simple", "DATE", "candidate")).toBe(systemPrompt("simple", "DATE"));
    expect(promptVersion("candidate")).toBe(promptVersion());
  });
});

describe("with one on trial", () => {
  it("about a tenth of users get it, the same users every time", () => {
    setCandidateForTests(trial);
    const chosen = users.filter((u) => variantFor(u) === "candidate");
    expect(chosen.length).toBeGreaterThan(150);
    expect(chosen.length).toBeLessThan(250);
    expect(users.filter((u) => variantFor(u) === "candidate")).toEqual(chosen);
  });

  it("their answers carry a different prompt version, and the stable one keeps its own", () => {
    const stable = promptVersion();
    setCandidateForTests(trial);
    expect(promptVersion()).toBe(stable);
    expect(promptVersion("candidate")).not.toBe(stable);
    expect(systemPrompt("simple", "DATE", "candidate")).toContain("Lead with the number.");
    expect(systemPrompt("simple", "DATE")).not.toContain("Lead with the number.");
  });

  it("the next candidate goes to a different tenth, and the share can be changed or turned off", () => {
    setCandidateForTests(trial);
    const first = users.filter((u) => variantFor(u) === "candidate");
    setCandidateForTests({ ...trial, name: "another" });
    const second = users.filter((u) => variantFor(u) === "candidate");
    expect(second.filter((u) => first.includes(u)).length).toBeLessThan(first.length / 2);
    process.env.ASK_CANDIDATE_SHARE = "0";
    expect(users.some((u) => variantFor(u) === "candidate")).toBe(false);
    process.env.ASK_CANDIDATE_SHARE = "100";
    expect(users.every((u) => variantFor(u) === "candidate")).toBe(true);
  });

  it("a bucket is a whole number from 0 to 99", () => {
    for (const u of users.slice(0, 200)) {
      const b = bucketOf(u, "x");
      expect(Number.isInteger(b) && b >= 0 && b < 100).toBe(true);
    }
  });
});
