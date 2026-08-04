import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Syllabi — Flexible Calendar",
    short_name: "Syllabi",
    description:
      "A tactile, constraint-based calendar for fixed events, flexible tasks, and intentions.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffefa",
    theme_color: "#19181d",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
