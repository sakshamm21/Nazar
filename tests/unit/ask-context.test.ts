/** Which language a question was asked in: recorded on every answer, and later used to check the answer matched. */
import { describe, expect, it } from "vitest";
import { detectLang } from "@/lib/ask/context";

describe("the language of a question", () => {
  it.each([
    "What is TCS trading at right now?",
    "Compare HDFC Bank and ICICI Bank on valuation",
    "Why is my portfolio down this month?",
    // A rupee sign, Indian names and one borrowed word do not make a question Hindi.
    "If I had done a ₹10,000 monthly SIP in the Nifty 50, what would it be worth?",
    "What does paisa vasool mean in investing?",
    "hi",
  ])("English: %s", (q) => expect(detectLang(q)).toBe("en"));

  it.each(["TCS abhi sasta hai kya?", "Nifty aaj kyun gira?", "Mere portfolio mein sabse risky share kaunsa hai? Hinglish mein samjhao", "SIP kya hota hai, batao"])("Hinglish: %s", (q) => expect(detectLang(q)).toBe("hinglish"));

  it.each(["रिलायंस का शेयर प्राइस क्या है?", "एसआईपी क्या होता है?", "TCS का P/E क्या है?"])("Hindi: %s", (q) => expect(detectLang(q)).toBe("hi"));
});
