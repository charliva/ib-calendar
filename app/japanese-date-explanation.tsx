"use client";

import { X } from "lucide-react";
import { getJapaneseCalendarDetails } from "@/lib/japanese-calendar";
import { formatDate } from "@/app/calendar-format";

export function JapaneseDateExplanation({
  date,
  onClose,
}: {
  date: Date;
  onClose: () => void;
}) {
  const details = getJapaneseCalendarDetails(date);
  return (
    <aside
      className="japanese-date-popover"
      role="dialog"
      aria-label={`Japanese calendar details for ${formatDate(date, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}`}
    >
      <header>
        <div>
          <span>Japanese calendar</span>
          <h3>
            {formatDate(date, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close explanation">
          <X size={14} />
        </button>
      </header>
      <dl>
        <div>
          <dt>Era</dt>
          <dd>
            <strong>{details.era}</strong>
            <span>
              {details.eraRomanization} {details.eraYear}
            </span>
            <small>{details.eraMeaning}</small>
          </dd>
        </div>
        <div>
          <dt>Rokuyō</dt>
          <dd>
            <strong>{details.rokuyo}</strong>
            <span>{details.rokuyoRomanization}</span>
            <small>{details.rokuyoMeaning}</small>
          </dd>
        </div>
      </dl>
      <p>
        Rokuyō is a traditional six-day fortune cycle. It is shown as cultural
        context, not as advice for planning your day.
      </p>
    </aside>
  );
}
