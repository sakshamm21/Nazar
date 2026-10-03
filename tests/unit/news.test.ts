import { describe, expect, it } from "vitest";
import { companyNeedles, dropShared, fetchCompanyNews, filterHeadlines, parseRss, type Headline } from "@/lib/news/google";

const since = new Date("2026-09-29T00:00:00Z");
const h = (title: string, source = "Moneycontrol", published = "2026-10-01T08:00:00Z"): Headline => ({ title: `${title} - ${source}`, source, link: `https://x/${encodeURIComponent(title)}`, published });

describe("company-specific news only", () => {
  const needles = companyNeedles("Tata Motors Passenger Vehicles Limited", "TMPV.NS", ["Tata Motors"]);
  const opts = { needles, otherCompanies: ["infosys", "hdfc bank", "reliance", "itc", "tcs"], since };
  it("keeps headlines clearly about the company", () => {
    const r = filterHeadlines([h("Tata Motors cuts JLR volume guidance for FY27"), h("Tata Motors shares slide after weak UK sales")], opts);
    expect(r).toHaveLength(2);
  });
  it("drops market wraps, roundups and lists that merely mention it", () => {
    const r = filterHeadlines(
      [
        h("Sensex today: Nifty ends lower; Tata Motors, Infosys top losers"),
        h("Stocks to watch: Tata Motors, HDFC Bank, Reliance, ITC"),
        h("Top losers: Tata Motors, Infosys and TCS drag indices"),
        h("Buzzing stocks: Tata Motors among 10 stocks in focus"),
        h("Stock market today: what to expect on Monday"),
      ],
      opts,
    );
    expect(r).toHaveLength(0);
  });
  it("drops tips, predictions and recommendation language", () => {
    const r = filterHeadlines([h("Buy Tata Motors, target price ₹900: brokerage"), h("Tata Motors share price prediction for 2027")], opts);
    expect(r).toHaveLength(0);
  });
  it("drops stale and duplicate headlines, keeps at most two, trusted sources first", () => {
    const r = filterHeadlines(
      [h("Tata Motors names new CFO", "Random Blog"), h("Tata Motors names new CFO", "Economic Times"), h("Tata Motors recalls 10,000 cars", "Livemint"), h("Tata Motors old story", "Mint", "2026-09-01T00:00:00Z"), h("Tata Motors opens plant", "Reuters")],
      opts,
    );
    expect(r).toHaveLength(2);
    expect(r.every((x) => /Economic Times|Livemint|Reuters/.test(x.source) || x.source === "Random Blog")).toBe(true);
    expect(r.some((x) => x.title.includes("old story"))).toBe(false);
  });
  it("drops headlines that show up for several holdings (generic news)", () => {
    const shared = h("Auto and IT stocks fall as markets slide");
    const out = dropShared(new Map([["TMPV.NS", [shared, h("Tata Motors recalls cars")]], ["INFY.NS", [shared]]]));
    expect(out.get("TMPV.NS")!.map((x) => x.title)).toEqual([h("Tata Motors recalls cars").title]);
    expect(out.get("INFY.NS")).toEqual([]);
  });
  it("parses Google News RSS", () => {
    const xml = `<rss><channel><item><title><![CDATA[Infosys wins deal &amp; more - Mint]]></title><link>https://n/1</link><pubDate>Thu, 01 Oct 2026 08:00:00 GMT</pubDate><source url="https://mint">Mint</source></item></channel></rss>`;
    expect(parseRss(xml)).toEqual([{ title: "Infosys wins deal & more - Mint", link: "https://n/1", source: "Mint", published: "2026-10-01T08:00:00.000Z" }]);
  });
  it("never throws: network failures mean no headlines", async () => {
    const r = await fetchCompanyNews("Infosys Limited", "INFY.NS", { since, otherCompanies: [], fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
    expect(r).toEqual([]);
  });
});
