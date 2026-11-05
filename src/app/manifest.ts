import type { MetadataRoute } from "next";

/** Lets Nazar be added to a phone's home screen and open like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nazar",
    short_name: "Nazar",
    description: "Everything you own in one place, and what it did, explained.",
    start_url: "/home",
    display: "standalone",
    background_color: "#0a0f1c",
    theme_color: "#0a0f1c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
