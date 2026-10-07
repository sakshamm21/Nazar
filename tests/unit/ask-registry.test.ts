/**
 * The registry is the one list of Ask tools. Everything else that names a tool has to agree with it:
 * the tools the model can call, the catalog on the Research page, and the samples the tests use.
 */
import { describe, expect, it } from "vitest";
import { TOOLS, TOOL_COUNT, isPrivateTool, sourcesOf, toolLabel, toolMeta, type ToolName } from "@/lib/ask/registry";
import { TOOL_CATALOG } from "@/lib/ask/tool-catalog";
import { makeTools } from "@/lib/ask/tools";
import { TOOL_RESULTS } from "../fixtures/ask-tool-results";

const names = Object.keys(TOOLS) as ToolName[];

describe("the tool registry", () => {
  it("lists exactly the tools the model can call", () => {
    expect(Object.keys(makeTools("test-user")).sort()).toEqual([...names].sort());
    expect(TOOL_COUNT).toBe(names.length);
  });

  it("every tool has a sample result for the tests", () => {
    expect(Object.keys(TOOL_RESULTS).sort()).toEqual([...names].sort());
  });

  it("the catalog only names real tools, and shows each one except the internal ticker search", () => {
    const shown = TOOL_CATALOG.flatMap((g) => g.items.flatMap((i) => i.tools));
    for (const t of shown) expect(names, t).toContain(t);
    expect([...new Set(shown)].sort()).toEqual(names.filter((n) => n !== "searchTicker").sort());
  });

  it("private results cannot be downloaded, and everything that writes is private", () => {
    for (const n of names) {
      const m = toolMeta(n)!;
      if (m.private) expect(m.excel, n).toBeNull();
      if (m.writes) expect(m.private, n).toBe(true);
    }
    expect(names.filter(isPrivateTool).sort()).toEqual(["addToWatchlist", "getMyPortfolio", "getWatchlist", "removeFromWatchlist"]);
  });

  it("a name from an old conversation that no longer exists is handled, not thrown on", () => {
    expect(toolMeta("getAlerts")).toBeUndefined();
    expect(toolMeta("constructor")).toBeUndefined();
    expect(toolLabel("getAlerts")).toBe("getAlerts");
    expect(isPrivateTool("getAlerts")).toBe(false);
  });

  it("names where an answer's data came from, once per source", () => {
    expect(sourcesOf(["getQuote", "getNews"])).toHaveLength(1);
    expect(sourcesOf(["getQuote", "getMyPortfolio"])).toHaveLength(2);
    expect(sourcesOf([])).toEqual([]);
  });

  it("every tool can say what it is doing before its input has arrived", () => {
    for (const n of names) expect(toolMeta(n)!.busy(undefined).length, n).toBeGreaterThan(5);
  });
});
