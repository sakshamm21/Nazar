/** The model catalog: what a call costs, which model "Auto" picks, and which provider a request goes to. */
import { afterEach, describe, expect, it } from "vitest";
import { AUTO_STATS, MODEL_STATS, statsFor } from "@/lib/ask/model-stats";
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
  it("never chooses a model that is offered for picking only", () => {
    for (const q of ["What is an ETF?", "Compare HDFC Bank and ICICI Bank on valuation", "Write a deep dive on Reliance"]) expect(getModel(routeModel(q, viaRouter))!.auto, q).not.toBe(false);
  });
  it("uses the deployment's chosen model for everything short of a deep dive, if it can be served", () => {
    expect(routeModel("What is an ETF?", viaRouter, "z-ai/glm-5.3-flash")).toBe("z-ai/glm-5.3-flash");
    expect(routeModel("Compare HDFC Bank and ICICI Bank", viaRouter, "z-ai/glm-5.3-flash")).toBe("z-ai/glm-5.3-flash");
    expect(getModel(routeModel("Write a deep dive on Reliance", viaRouter, "z-ai/glm-5.3-flash"))!.tier).toBe("premium");
    expect(routeModel("What is an ETF?", viaRouter, "someone/not-offered")).toBe("openai/gpt-6-luna");
  });
  it("offers open-weight models, and says so", () => {
    const open = MODELS.filter((m) => m.openWeights);
    expect(open.length).toBeGreaterThanOrEqual(3);
    for (const m of open) expect(m.blurb).toMatch(/^Open weights\./);
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

describe("what Settings says about each model", () => {
  it("has measured figures for every model offered through OpenRouter, and for none that is not in the catalog", () => {
    for (const id of viaRouter) expect(statsFor(id), id).not.toBeNull();
    for (const id of Object.keys(MODEL_STATS)) expect(getModel(id), id).toBeDefined();
  });
  it("never claims more questions passed than were asked, and says what each figure was measured on", () => {
    for (const [id, s] of [...Object.entries(MODEL_STATS), ["auto", AUTO_STATS] as const]) {
      if (s.passed != null) expect(s.passed, id).toBeLessThanOrEqual(s.outOf!);
      expect(s.testedOn.length, id).toBeGreaterThan(10);
      if (s.usdPer1000Answers != null) expect(s.usdPer1000Answers, id).toBeGreaterThan(0);
    }
  });
  it("describes the choice and does not make it: routing reads nothing from these figures", () => {
    const questions = ["What is TCS trading at?", "Compare HDFC Bank and ICICI Bank on valuation", "Write a deep dive on Reliance"];
    const before = questions.map((q) => routeModel(q, viaRouter));
    const kept = Object.entries(MODEL_STATS).map(([id, s]) => [id, s.passed] as const);
    try {
      for (const s of Object.values(MODEL_STATS)) s.passed = 0;
      expect(questions.map((q) => routeModel(q, viaRouter))).toEqual(before);
    } finally {
      for (const [id, passed] of kept) MODEL_STATS[id].passed = passed;
    }
  });
});

describe("a server of the deployment's own", () => {
  const keys = ["SELF_HOSTED_BASE_URL", "SELF_HOSTED_MODELS", "SELF_HOSTED_API_KEY"];
  afterEach(() => {
    for (const k of keys) delete process.env[k];
  });

  it("serves nothing until it is given an address, whatever models are named", async () => {
    const { selfHostedModels } = await import("@/lib/ask/provider");
    process.env.SELF_HOSTED_MODELS = "z-ai/glm-5.3-flash";
    expect(selfHostedModels().size).toBe(0);
  });

  it("serves the models it names, each under the name that server knows it by", async () => {
    const { selfHostedModels, askConfigured: configured } = await import("@/lib/ask/provider");
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.SELF_HOSTED_BASE_URL = "http://10.0.0.5:8000/v1";
    process.env.SELF_HOSTED_MODELS = "z-ai/glm-5.3-flash=glm-5.3-flash, deepseek/deepseek-v4.1-flash";
    expect([...selfHostedModels()]).toEqual([["z-ai/glm-5.3-flash", "glm-5.3-flash"], ["deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4.1-flash"]]);
    // With no hosted key at all, Ask can still run on that server alone.
    expect(configured()).toBe(true);
  });

  it("puts those models on offer, and only ones the catalog knows", async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.SELF_HOSTED_BASE_URL = "http://10.0.0.5:8000/v1";
    process.env.SELF_HOSTED_MODELS = "z-ai/glm-5.3-flash,someone/unknown-model";
    const ids = await allowedModelIds();
    expect(ids).toContain("z-ai/glm-5.3-flash");
    expect(ids).not.toContain("someone/unknown-model");
  });

  it("every open-weight model in the catalog is one such a server could run, and says so in Settings' figures", () => {
    const open = MODELS.filter((m) => m.openWeights).map((m) => m.id);
    expect(open.length).toBeGreaterThanOrEqual(1);
    for (const id of open) expect(statsFor(id), id).not.toBeNull();
  });
});
