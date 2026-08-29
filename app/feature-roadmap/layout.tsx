import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Feature roadmap — Syllabi",
  description:
    "Practical next features for conflict-safe timetable imports, fast assignment capture, and calmer school planning.",
};

export default function FeatureRoadmapLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
