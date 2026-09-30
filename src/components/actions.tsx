"use client";
import { createContext, useContext } from "react";

/**
 * App-level actions that generative-UI components may call (e.g. the ★ on a quote card).
 * Absent on read-only surfaces such as shared links, so components must treat it as optional.
 */
export interface AppActions {
  watch?: (symbol: string) => void;
  watched?: Set<string>;
}

export const ActionsContext = createContext<AppActions | null>(null);
export const useActions = () => useContext(ActionsContext);
