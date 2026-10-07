/** The model catalog: what a call costs, which model "Auto" picks, and which provider a request goes to. */
import { afterEach, describe, expect, it } from "vitest";
import { MODELS, estimateCost, getModel, routeModel } from "@/lib/ask/models";
import { allowedModelIds } from "@/lib/ask/openai-models";
import { activeProvider, askConfigured } from "@/lib/ask/provider";

const viaRouter = MODELS.filter((m) => m.via === "openrouter").map((m) => m.id);
const viaOpenAI = MODELS.filter((m) => m.via === "openai").map((m) => m.id);
const env = { ...process.env };
afterEach(() => {
  for (const k of ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "ALLOWED_MODELS"]) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
});

describe("what a call costs", () => {
  it("prices input and output per million tokens", () => {
    expect(estimateCost("openai/gpt-6-luna", 1_000_000, 1_000_000)).toBeCloseTo(0.6);
  });
  it("prices cached input at the cache rate, so a multi-step answer is not overstated", () => {
    const full = estimateCost("openai/gpt-6-sol", 20_000, 500);
    const cached = estimateCost("openai/gpt-6-sol", 20_000, 500, 16_000);
    expect(full).toBeCloseTo(0.045);
    expect(cached).toBeCloseTo(0.0162);
  });
  it("never counts more cached tokens than there were input tokens", () => {
    expect(estimateCost("openai/gpt-6-luna", 1000, 0, 5000)).toBeCloseTo(estimateCost("openai/gpt-6-luna", 1000, 0, 1000));
  });
  it("a model without a cache price is charged in full, and an unknown model costs nothing", () => {
    expect(estimateCost("gpt-5.4", 1000, 0, 1000)).toBeCloseTo(estimateCost("gpt-5.4", 1000, 0));
    expect(estimateCost("someone/unknown-model", 1000, 1000)).toBe(0);
  });
});

describe("the catalog", () => {
  it("has no duplicate ids, and each provider can serve a lookup and a deep dive", () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
    for (const via of ["openrouter", "openai"] as const) for (const tier of ["economy", "premium"] as const) expect(MODELS.some((m) => m.via === via && m.tier === tier), `${via} ${tier}`).toBe(true);
  });
  it("OpenRouter ids name their maker; OpenAI ids do not", () => {
    for (const id of viaRouter) expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9.:-]+$/);
    for (const id of viaOpenAI) expect(id).not.toContain("/");
  });
  it("an answer written by either provider's model can still be labelled", () => {
    expect(getModel("gpt-6-luna")?.label).toBe("GPT-6 Luna");
    expect(getModel("openai/gpt-6-luna")?.label).toBe("GPT-6 Luna");
  });
});

describe("Auto routing", () => {
  it.each([viaRouter, viaOpenAI])("picks only from the models on offer, by tier", (...available) => {
    const tierOf = (q: string) => getModel(routeModel(q, available))!.tier;
    expect(available).toContain(routeModel("What is TCS trading at?", available));
    expect(tierOf("What is an ETF?")).toBe("economy");
    // On OpenRouter no model has earned the middle tier yet, so analysis falls through to the lookup model.
    expect(tierOf("Compare HDFC Bank and ICICI Bank on valuation")).toBe(available[0].includes("/") ? "economy" : "balanced");
    expect(tierOf("Write a deep dive on Reliance")).toBe("premium");
  });
  it("falls to the nearest tier when the one it wants is not available", () => {
    expect(routeModel("Write a deep dive on Reliance", ["openai/gpt-6-luna"])).toBe("openai/gpt-6-luna");
  });
});

describe("which provider is used", () => {
  it("OpenRouter when its key is set, OpenAI otherwise", async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ALLOWED_MODELS;
    expect(askConfigured()).toBe(false);
    expect(activeProvider()).toBe("openai");
    // With no key there is nothing to ask the provider, so the whole catalog for it is offered.
    expect(await allowedModelIds()).toEqual(viaOpenAI);
  });
  it("ALLOWED_MODELS narrows the list, and is ignored if it names nothing on offer", async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.ALLOWED_MODELS = "gpt-6-luna, gpt-6-sol";
    expect(await allowedModelIds()).toEqual(["gpt-6-luna", "gpt-6-sol"]);
    process.env.ALLOWED_MODELS = "openai/gpt-6-luna";
    expect(await allowedModelIds()).toEqual(viaOpenAI);
  });
});
