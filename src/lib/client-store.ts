"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Small client-state helpers built on useSyncExternalStore (no effects that set state, so no
 * extra renders and no hydration mismatches: the server snapshot is used for the first paint).
 */

const noSubscribe = () => () => {};

/** false during server render and hydration, true afterwards. */
export const useHydrated = () => useSyncExternalStore(noSubscribe, () => true, () => false);

const PREF_EVENT = "nazar:pref";

/**
 * A preference kept in localStorage, shared live between components and tabs. Falls back when
 * storage is unavailable (private windows) or the stored value isn't one of `allowed`.
 */
export function useStoredPref<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (v: T) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = (e: Event) => {
        if (!(e instanceof StorageEvent) || e.key === key) onChange();
      };
      window.addEventListener("storage", handler);
      window.addEventListener(PREF_EVENT, handler);
      return () => {
        window.removeEventListener("storage", handler);
        window.removeEventListener(PREF_EVENT, handler);
      };
    },
    [key],
  );
  const read = () => {
    try {
      const v = localStorage.getItem(key);
      return v != null && (!allowed || allowed.includes(v as T)) ? (v as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {}
      window.dispatchEvent(new Event(PREF_EVENT));
    },
    [key],
  );
  return [value, set];
}
