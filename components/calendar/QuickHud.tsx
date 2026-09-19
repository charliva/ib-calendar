"use client";

import { Activity, Focus, History, X } from "lucide-react";
import {
  capacityForDay,
  dateFromKey,
  energyLabels,
  type CalendarItem,
  type HistoryEntry,
} from "../../lib/calendar-engine.ts";
import { formatDate, formatTime } from "../../app/calendar-format.ts";

type DayCapacity = ReturnType<typeof capacityForDay>;

function HudRow({
  label,
  item,
  empty,
}: {
  label: string;
  item?: CalendarItem;
  empty: string;
}) {
  return (
    <div className="hud-row">
      <span>{label}</span>
      {item ? (
        <div>
          <time>{formatTime(item.startsAt)}</time>
          <strong>{item.title}</strong>
          <small>{energyLabels[item.energyType]}</small>
        </div>
      ) : (
        <div className="hud-row-empty">{empty}</div>
      )}
    </div>
  );
}

export function QuickHud({
  open,
  historyOpen,
  history,
  selectedDay,
  nowItem,
  nextItem,
  laterItems,
  dayCapacity,
  insights,
  onClose,
  onRestore,
  onOpenItem,
}: {
  open: boolean;
  historyOpen: boolean;
  history: HistoryEntry[];
  selectedDay: string;
  nowItem?: CalendarItem;
  nextItem?: CalendarItem;
  laterItems: CalendarItem[];
  dayCapacity: DayCapacity;
  insights: string[];
  onClose: () => void;
  onRestore: (entry: HistoryEntry) => void;
  onOpenItem: (item: CalendarItem) => void;
}) {
  return (
    <aside
      className={`quick-hud ${open ? "is-open" : ""} ${
        historyOpen ? "show-history" : ""
      }`}
      inert={!open}
    >
      {historyOpen ? (
        <>
          <header className="hud-header">
            <div>
              <span className="micro-label">Schedule states</span>
              <h2>History</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close history">
              <X size={15} />
            </button>
          </header>
          <div className="history-list">
            {history.length === 0 ? (
              <div className="hud-empty">
                <History size={21} />
                <p>Edits, moves, and approved proposals will appear here.</p>
              </div>
            ) : (
              history.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  onClick={() => onRestore(entry)}
                >
                  <span>{entry.label}</span>
                  <time>
                    {formatDate(new Date(entry.createdAt), {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <small>Preview restore</small>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <header className="hud-header">
            <div>
              <span className="micro-label">Quick HUD</span>
              <h2>
                {formatDate(dateFromKey(selectedDay), {
                  weekday: "long",
                  day: "numeric",
                })}
              </h2>
            </div>
            <Activity size={17} />
            <button
              type="button"
              aria-label="Close Quick HUD"
              onClick={onClose}
            >
              <X size={15} />
            </button>
          </header>

          <section className="temporal-hud">
            <HudRow label="Now" item={nowItem} empty="Open time" />
            <HudRow label="Next" item={nextItem} empty="Nothing queued" />
            <div className="hud-later">
              <span>Later</span>
              {laterItems.length ? (
                laterItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onOpenItem(item)}
                  >
                    <time>{formatTime(item.startsAt)}</time>
                    <strong>{item.title}</strong>
                  </button>
                ))
              ) : (
                <small>Space remains flexible</small>
              )}
            </div>
          </section>

          <section className="capacity-card">
            <div className="capacity-title">
              <span>Daily capacity</span>
              <strong>{dayCapacity.load}%</strong>
            </div>
            <div className="capacity-track">
              <i style={{ width: `${dayCapacity.load}%` }} />
            </div>
            <dl>
              <div>
                <dt>
                  <span className="capacity-dot deep" /> Total load
                </dt>
                <dd>{dayCapacity.total}m</dd>
              </div>
              <div>
                <dt>
                  <span className="capacity-dot focus" /> High energy
                </dt>
                <dd>{dayCapacity.deep}m</dd>
              </div>
              <div>
                <dt>
                  <span className="capacity-dot social" /> Moderate
                </dt>
                <dd>{dayCapacity.social}m</dd>
              </div>
              <div>
                <dt>
                  <span className="capacity-dot recovery" /> Light
                </dt>
                <dd>{dayCapacity.recovery}m</dd>
              </div>
            </dl>
          </section>

          <section className="insight-card">
            <div className="dock-title">
              <span>
                <Focus size={13} /> Schedule signals
              </span>
            </div>
            {insights.length ? (
              <ul>
                {insights.map((insight) => (
                  <li key={insight}>{insight}</li>
                ))}
              </ul>
            ) : (
              <p>Your day has room to breathe.</p>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
