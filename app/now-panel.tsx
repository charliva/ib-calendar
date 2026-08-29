"use client";

import {
  CalendarClock,
  Focus,
  Laptop,
  Lock,
  Play,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import { formatDate } from "@/app/calendar-format";
import type {
  CurrentStudyLocation,
  NowRecommendation,
  NowRecommendationResult,
} from "@/lib/now-recommender";
import type { EnergyRequirement } from "@/lib/calendar-engine";

export function NowPanel({
  result,
  location,
  energy,
  computerAvailable,
  onLocationChange,
  onEnergyChange,
  onComputerAvailableChange,
  onRefresh,
  onStart,
  onClose,
}: {
  result: NowRecommendationResult;
  location: CurrentStudyLocation;
  energy: EnergyRequirement;
  computerAvailable: boolean;
  onLocationChange: (value: CurrentStudyLocation) => void;
  onEnergyChange: (value: EnergyRequirement) => void;
  onComputerAvailableChange: (value: boolean) => void;
  onRefresh: () => void;
  onStart: (recommendation: NowRecommendation) => void;
  onClose: () => void;
}) {
  const locations: CurrentStudyLocation[] = [
    "home",
    "school",
    "library",
    "commute",
  ];
  const energies: EnergyRequirement[] = ["low", "medium", "high"];
  return (
    <div
      className="overlay now-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="now-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="now-panel-title"
      >
        <header>
          <span className="now-panel-mark">
            <Zap size={17} fill="currentColor" />
          </span>
          <div>
            <span className="micro-label">Decision mode</span>
            <h2 id="now-panel-title">What should I do now?</h2>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh options"
          >
            <RefreshCw size={15} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="now-context">
          <fieldset>
            <legend>Where are you?</legend>
            <div className="now-segments">
              {locations.map((value) => (
                <button
                  className={location === value ? "active" : ""}
                  type="button"
                  key={value}
                  onClick={() => onLocationChange(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Energy right now</legend>
            <div className="now-segments">
              {energies.map((value) => (
                <button
                  className={energy === value ? "active" : ""}
                  type="button"
                  key={value}
                  onClick={() => onEnergyChange(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="now-tool-toggle">
            <input
              type="checkbox"
              checked={computerAvailable}
              onChange={(event) =>
                onComputerAvailableChange(event.target.checked)
              }
            />
            <Laptop size={14} />
            Computer available
          </label>
        </div>

        <div className="now-window">
          <CalendarClock size={17} />
          {result.nextFixed ? (
            <div>
              <strong>
                {result.nextFixed.current
                  ? `${result.nextFixed.title} is happening now`
                  : `You have ${result.availableMinutes} minutes`}
              </strong>
              <span>
                {result.nextFixed.current
                  ? `Until ${formatDate(new Date(result.nextFixed.endsAt), {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : `Before ${result.nextFixed.title} at ${formatDate(
                      new Date(result.nextFixed.startsAt),
                      { hour: "2-digit", minute: "2-digit" },
                    )}`}
              </span>
            </div>
          ) : (
            <div>
              <strong>{result.availableMinutes} usable minutes</strong>
              <span>No fixed event in the next two hours.</span>
            </div>
          )}
        </div>

        {result.recommendations.length ? (
          <div className="now-recommendations">
            {result.recommendations.map((recommendation, index) => (
              <article
                className={index === 0 ? "is-best" : ""}
                key={recommendation.id}
              >
                <span className="now-rank">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="now-recommendation-copy">
                  <div>
                    <h3>{recommendation.title}</h3>

                    <span className="now-duration">
                      {recommendation.durationMinutes} min
                    </span>
                  </div>
                  <p>{recommendation.detail}</p>
                  <ul aria-label="Why this was recommended">
                    {recommendation.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
                <button
                  className="now-start"
                  type="button"
                  onClick={() => onStart(recommendation)}
                >
                  <Play size={13} fill="currentColor" />
                  {recommendation.source === "exploration"
                    ? "Explore"
                    : "Start"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="now-empty">
            <Focus size={20} />
            <h3>Nothing suitable right now</h3>
            <p>
              {result.blockedReason ??
                result.freeTimeReason ??
                "Try changing your location, energy, or available tools."}
            </p>
          </div>
        )}
        <footer>
          <Lock size={12} />
          Ranked locally from time, urgency, context, energy, challenge, recent
          work, tools, and progress. Nothing starts until you choose it.
        </footer>
      </section>
    </div>
  );
}
