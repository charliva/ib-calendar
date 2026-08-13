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

const ROKUYO_DETAILS: Record<
  Rokuyo,
  { romanization: string; meaning: string }
> = {
  大安: {
    romanization: "Taian",
    meaning: "Traditionally considered the most auspicious day in the cycle.",
  },
  赤口: {
    romanization: "Shakkō",
    meaning: "Traditionally considered unlucky, apart from a short period around noon.",
  },
  先勝: {
    romanization: "Senshō",
    meaning: "Traditionally favorable in the morning and quieter after noon.",
  },
  友引: {
    romanization: "Tomobiki",
    meaning: "Generally favorable, except around noon; literally associated with “pulling friends.”",
  },
  先負: {
    romanization: "Senbu",
    meaning: "Traditionally quieter in the morning and more favorable later in the day.",
  },
  仏滅: {
    romanization: "Butsumetsu",
    meaning: "Traditionally considered the least auspicious day in the cycle.",
  },
};

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

export function getEraDetails(date: Date) {
  const parts = japaneseEraFormatter.formatToParts(date);
  const era = parts.find((part) => part.type === "era")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const knownEra = {
    令和: {
      romanization: "Reiwa",
      meaning: "The current imperial era, which began in 2019.",
    },
    平成: {
      romanization: "Heisei",
      meaning: "The imperial era from 1989 to 2019.",
    },
    昭和: {
      romanization: "Shōwa",
      meaning: "The imperial era from 1926 to 1989.",
    },
  }[era];

  return {
    label: `${era}${year}年`,
    romanization: knownEra?.romanization ?? "Japanese imperial era",
    meaning: knownEra?.meaning ?? "A year in Japan’s imperial-era calendar.",
    year,
  };
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
  const era = getEraDetails(date);
  return {
    era: era.label,
    eraRomanization: era.romanization,
    eraMeaning: era.meaning,
    eraYear: era.year,
    rokuyo,
    rokuyoRomanization: ROKUYO_DETAILS[rokuyo].romanization,
    rokuyoMeaning: ROKUYO_DETAILS[rokuyo].meaning,
    tone: getRokuyoTone(rokuyo),
  } as const;
}
