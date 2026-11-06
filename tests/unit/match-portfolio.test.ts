import { describe, expect, it } from "vitest";
import { matchPortfolio } from "@/lib/ask/match-portfolio";

const pfs = [{ name: "My portfolio" }, { name: "Dividend basket" }, { name: "Long-term money" }];

describe("which portfolio a question names", () => {
  it("'my portfolio' and the like mean all of them, even with a portfolio called that", () => {
    for (const q of ["My portfolio", "my portfolio", "portfolio", "my holdings", "all", "my money", "all my portfolios", undefined, ""]) expect(matchPortfolio(pfs, q)).toBeNull();
  });
  it("finds a portfolio picked out by its name", () => {
    expect(matchPortfolio(pfs, "Dividend basket")?.name).toBe("Dividend basket");
    expect(matchPortfolio(pfs, "my dividend basket")?.name).toBe("Dividend basket");
    expect(matchPortfolio(pfs, "the long-term money portfolio")?.name).toBe("Long-term money");
    expect(matchPortfolio(pfs, "dividend")?.name).toBe("Dividend basket");
  });
  it("an unknown name, or a single portfolio, means all", () => {
    expect(matchPortfolio(pfs, "crypto stash")).toBeNull();
    expect(matchPortfolio([{ name: "Dividend basket" }], "Dividend basket")).toBeNull();
  });
});
