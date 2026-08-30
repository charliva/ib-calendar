import type { TimetableExtractionCandidate } from "../timetable-import.ts";

export type ExtractionCandidate = TimetableExtractionCandidate;

export type ExtractionResponse = {
  title: string;
  summary: string;
  items: ExtractionCandidate[];
};

export function isExtractionResponse(value: unknown): value is ExtractionResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.items) &&
    candidate.items.every((item) => {
      if (!item || typeof item !== "object") return false;
      const entry = item as Record<string, unknown>;
      return (
        typeof entry.title === "string" &&
        ["event", "task", "intention"].includes(String(entry.kind)) &&
        typeof entry.evidence === "string"
      );
    })
  );
}

export function documentMediaType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "heic" || extension === "heif") return "image/heic";
  if (extension === "pdf") return "application/pdf";
  if (extension === "csv") return "text/csv";
  if (extension === "txt") return "text/plain";
  return "application/octet-stream";
}
