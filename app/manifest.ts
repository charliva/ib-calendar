import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Syllabi — homework that plans itself",
    short_name: "Syllabi",
    description:
      "Capture homework, generate a study plan, and keep working offline.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7fa",
    theme_color: "#6c5ce7",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
