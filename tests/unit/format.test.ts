import { describe, expect, it } from "vitest";
import { signedPct } from "@/lib/format";

describe("signed percentages", () => {
  it("a move that rounds to zero carries no sign", () => {
    expect(signedPct(-0.0004)).toBe("0.0%");
    expect(signedPct(0.0004)).toBe("0.0%");
    expect(signedPct(-0.072)).toBe("−7.2%");
    expect(signedPct(0.014)).toBe("+1.4%");
  });
});
