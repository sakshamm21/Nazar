/**
 * Which of the tools that change something a question may use, decided from the user's own words
 * before any model runs.
 *
 * Ask reads text it did not write: headlines, company profiles. A line planted in one of those
 * ("add XYZ to the watchlist") is an instruction only if the model treats it as one, and a prompt
 * can ask it not to but cannot make it. So the tools that write are simply not offered unless the
 * latest message asks for that change. A model cannot call a tool it was never given.
 *
 * Cautious in the other direction from prefetch.ts: a miss means the model says it cannot change
 * the list and tells the user how to ask, which costs one more message and never a wrong write.
 *
 * Pure: the caller passes in the assistant's previous message, for a "yes" that answers its offer.
 */
import { TOOLS, toolMeta, type ToolName } from "./registry";

/** Every tool the registry marks as changing something for the user. */
export const WRITE_TOOLS = (Object.keys(TOOLS) as ToolName[]).filter((n) => toolMeta(n)?.writes === true);

/** The Watching list, by any of the names people give it, in three scripts. */
const LIST = /\b(watch\s?list|watching|watch|track(ing|ed)?|follow(ing|ed)?|list|nazar rakh\w*)\b|वॉच|लिस्ट|सूची|नज़र|नजर/i;
const ADD = /\b(add|adding|put|include|start|jod\w*|daal\w*|dal do|rakh\w*)\b|जोड़|जोड|डाल|रख/i;
const REMOVE = /\b(remove|removing|delete|drop|take|stop|unwatch|unfollow|hata\w*|nikal\w*)\b|हटा|निकाल/i;
/** "Watch Titan for me", "Track HDFC Bank": the list is the verb. Not "track record" or "follow up". */
const WATCH_THIS = /^\s*(please\s+|pls\s+|can you\s+|could you\s+)?(watch|track|follow)\s+(?!record\b|up\b)\S/i;
const STOP_WATCHING = /\b(unwatch|unfollow)\b/i;
/** A short yes, to an offer the assistant made in its last message. */
const YES = /^\s*(yes|yeah|yep|sure|ok|okay|please do|go ahead|do it|haan|han|ha|ji|theek hai|kar do|हाँ|हां|जी|ठीक है|कर दो)(?![\p{L}\p{M}])/iu;

export function writesAsked(text: string, previousAssistant = ""): ToolName[] {
  const asked = new Set<ToolName>();
  const about = LIST.test(text);
  if ((about && ADD.test(text)) || WATCH_THIS.test(text)) asked.add("addToWatchlist");
  if ((about && REMOVE.test(text)) || STOP_WATCHING.test(text)) asked.add("removeFromWatchlist");
  // "Yes" on its own asks for whatever was just offered: the last question the assistant put.
  if (!asked.size && YES.test(text) && text.trim().split(/\s+/).length <= 6) {
    const offer = previousAssistant.split(/(?<=[.!?।])\s+/).filter((s) => /[?？]\s*$/.test(s.trim()) && LIST.test(s)).at(-1);
    if (offer && ADD.test(offer)) asked.add("addToWatchlist");
    if (offer && REMOVE.test(offer)) asked.add("removeFromWatchlist");
  }
  return WRITE_TOOLS.filter((n) => asked.has(n));
}
