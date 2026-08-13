import { Solar } from "lunar-javascript";

export const ROKUYO = [
  "大安",
  "赤口",
  "先勝",
  "友引",
  "先負",
  "仏滅",
] as const;

export type Rokuyo = (typeof ROKUYO)[number];
export type RokuyoTone = "auspicious" | "inauspicious" | "neutral";

const japaneseEraFormatter = new Intl.DateTimeFormat(
  "ja-JP-u-ca-japanese",
  {
    era: "long",
    year: "numeric",
  },
);

export function getEraLabel(date: Date) {
  const parts = japaneseEraFormatter.formatToParts(date);
  const era = parts.find((part) => part.type === "era")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${era}${year}年`;
}

export function getRokuyoFromLunarDate(month: number, day: number): Rokuyo {
  const index = (Math.abs(month) + day) % ROKUYO.length;
  return ROKUYO[index];
}

export function getRokuyo(date: Date): Rokuyo {
  const lunar = Solar.fromYmd(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ).getLunar();

  return getRokuyoFromLunarDate(lunar.getMonth(), lunar.getDay());
}

export function getRokuyoTone(rokuyo: Rokuyo): RokuyoTone {
  if (rokuyo === "大安") return "auspicious";
  if (rokuyo === "仏滅") return "inauspicious";
  return "neutral";
}

export function getJapaneseCalendarDetails(date: Date) {
  const rokuyo = getRokuyo(date);
  return {
    era: getEraLabel(date),
    rokuyo,
    tone: getRokuyoTone(rokuyo),
  } as const;
}
