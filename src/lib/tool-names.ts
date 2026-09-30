/** Tools whose output is the user's private data — hidden on shared links. Safe to import on the client. */
export const PRIVATE_TOOLS = new Set(["getWatchlist", "addToWatchlist", "removeFromWatchlist", "createPriceAlert", "listPriceAlerts", "deletePriceAlerts"]);
