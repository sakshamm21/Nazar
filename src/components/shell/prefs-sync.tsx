"use client";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { useStoredPref } from "@/lib/client-store";

/**
 * Brings the account's saved choices (Ask's model, the theme) to this device when the app opens, so
 * a choice made on the phone holds on the laptop too. Changes are saved where they are made.
 */
export function PrefsSync({ model, theme }: { model: string | null; theme: "dark" | "light" | null }) {
  const [local, setLocal] = useStoredPref<string>("nazar:model", "auto");
  const { theme: current, setTheme } = useTheme();
  useEffect(() => {
    if (model && model !== local) setLocal(model);
    // Only on opening: what the person changes afterwards wins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);
  useEffect(() => {
    if (theme && theme !== current) setTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  return null;
}
