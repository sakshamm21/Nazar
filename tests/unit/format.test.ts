import { describe, expect, it } from "vitest";
import { dateLabel, rangeLabel, signedPct } from "@/lib/format";

describe("signed percentages", () => {
  it("a move that rounds to zero carries no sign", () => {
    expect(signedPct(-0.0004)).toBe("0.0%");
    expect(signedPct(0.0004)).toBe("0.0%");
    expect(signedPct(-0.072)).toBe("−7.2%");
    expect(signedPct(0.014)).toBe("+1.4%");
  });
});

describe("dates with their year", () => {
  it("a goal years away says which year", () => {
    expect(dateLabel("2030-11-04")).toBe("4 Nov 2030");
  });
  it("a period in one year names the year once; across years, both", () => {
    expect(rangeLabel("2026-10-07", "2026-11-06")).toBe("7 Oct to 6 Nov 2026");
    expect(rangeLabel("2025-11-06", "2026-11-06")).toBe("6 Nov 2025 to 6 Nov 2026");
    expect(rangeLabel("last month", "today")).toBe("last month to today");
  });
});
