import {
  ArrowDownToLine,
  Command,
  FileUp,
  Move,
  Search,
  Sparkles,
} from "lucide-react";
import { useRef, type FormEvent } from "react";
import { formatDate } from "../../app/calendar-format.ts";
import type { ParsedCommand } from "../../lib/calendar/commands.ts";
import type { ParsedHomework } from "../../lib/homework-parser.ts";

export function CommandPalette({
  open,
  mode,
  commandText,
  commandBusy,
  commandConversation,
  commandQuestions,
  commandPreview,
  homeworkCommandPreview,
  commandIsHomework,
  onClose,
  onModeChange,
  onCommandTextChange,
  onSubmit,
  onResetConversation,
  onDocumentSelected,
}: {
  open: boolean;
  mode: "command" | "filter" | "upload";
  commandText: string;
  commandBusy: boolean;
  commandConversation: Array<{ role: "user" | "assistant"; text: string }>;
  commandQuestions: Array<{ field: "subject" | "date" | "time" | "location" | "other"; label: string }>;
  commandPreview: ParsedCommand | null;
  homeworkCommandPreview: ParsedHomework;
  commandIsHomework: boolean;
  onClose: () => void;
  onModeChange: (mode: "command" | "filter" | "upload") => void;
  onCommandTextChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onResetConversation: () => void;
  onDocumentSelected: (file: File | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  if (!open) return null;

  return (
        <div
          className="overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose();
          }}
        >
          <section className="command-palette" aria-label="Command palette">
            <header>
              <Command size={17} />
              <span>Command</span>
              <kbd>esc</kbd>
            </header>
            <div className="palette-modes">
              <button
                className={mode === "command" ? "active" : ""}
                type="button"
                onClick={() => onModeChange("command")}
              >
                <Sparkles size={13} /> Create / transform
              </button>
              <button
                className={mode === "filter" ? "active" : ""}
                type="button"
                onClick={() => onModeChange("filter")}
              >
                <Search size={13} /> Filter
              </button>
              <button
                className={mode === "upload" ? "active" : ""}
                type="button"
                onClick={() => onModeChange("upload")}
              >
                <FileUp size={13} /> Document
              </button>
            </div>
            {mode === "upload" ? (
              <div className="upload-drop">
                <FileUp size={24} />
                <h3>Document → proposed calendar</h3>
                <p>
                  Timetable, ticket, syllabus, poster, image, text, or PDF.
                  Nothing is applied without a diff.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={commandBusy}
                >
                  {commandBusy ? "Reading…" : "Choose document"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,text/plain,text/csv"
                  onChange={(event) =>
                    onDocumentSelected(event.target.files?.[0] ?? null)
                  }
                  hidden
                />
              </div>
            ) : (
              <form onSubmit={onSubmit}>
                {mode === "command" &&
                  commandConversation.length > 0 && (
                    <section
                      className="command-conversation"
                      aria-label="Command conversation"
                    >
                      <header>
                        <span>One thing at a time</span>
                        <button
                          type="button"
                          onClick={() => {
                            onResetConversation();
                          }}
                        >
                          Start over
                        </button>
                      </header>
                      <div className="command-turns" aria-live="polite">
                        {commandConversation.slice(-4).map((turn, index) => (
                          <p
                            className={turn.role}
                            key={`${turn.role}-${index}-${turn.text}`}
                          >
                            {turn.text}
                          </p>
                        ))}
                      </div>
                      {commandQuestions.length > 0 && (
                        <div className="command-question-pills">
                          {commandQuestions.map((question) => (
                            <span key={question.field}>{question.label}</span>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                <div className="palette-input">
                  {mode === "command" ? (
                    <Sparkles size={18} />
                  ) : (
                    <Search size={18} />
                  )}
                  <input
                    autoFocus
                    value={commandText}
                    onChange={(event) => onCommandTextChange(event.target.value)}
                    placeholder={
                      mode === "filter"
                        ? "deep focus, task, chemistry…"
                        : commandConversation.length > 0
                          ? "Answer naturally…"
                          : "Chemistry pages 52–57 Thursday"
                    }
                    aria-label="Calendar command"
                  />
                  <button
                    type="submit"
                    disabled={!commandText.trim() || commandBusy}
                  >
                    {commandBusy
                      ? "Thinking…"
                      : commandIsHomework
                        ? "Capture"
                        : "Preview"}
                  </button>
                </div>
                {mode === "command" &&
                commandConversation.length === 0 &&
                commandIsHomework ? (
                  <div
                    className="parsed-intent homework-intent"
                    aria-label="Parsed homework"
                  >
                    <span>Instant capture · local</span>
                    <div>
                      <strong>
                        {homeworkCommandPreview.matched.subject ?? "Homework"}
                      </strong>
                      <i>{homeworkCommandPreview.title}</i>
                      {homeworkCommandPreview.deadline && (
                        <>
                          <Move size={12} />
                          <i>
                            {formatDate(
                              new Date(homeworkCommandPreview.deadline),
                              {
                                weekday: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </i>
                        </>
                      )}
                      <i className="intent-shift">
                        {homeworkCommandPreview.taskType}
                      </i>
                    </div>
                  </div>
                ) : mode === "command" &&
                  commandConversation.length === 0 &&
                  commandPreview ? (
                  <div className="parsed-intent" aria-label="Parsed command">
                    <span>Parsed intent</span>
                    <div>
                      <strong>{commandPreview.action}</strong>
                      <i>{commandPreview.subject}</i>
                      {commandPreview.timing && (
                        <>
                          <Move size={12} />
                          <i>{commandPreview.timing}</i>
                        </>
                      )}
                      {commandPreview.shift && (
                        <i className="intent-shift">{commandPreview.shift}</i>
                      )}
                    </div>
                  </div>
                ) : null}
              </form>
            )}
            {mode === "command" && commandConversation.length === 0 && (
              <div className="command-examples">
                {[
                  "Chemistry pages 52–57 Thursday",
                  "Biology essay Friday 18:00",
                  "French vocab tomorrow",
                  "Move everything tomorrow afternoon one hour later",
                ].map((example) => (
                  <button
                    type="button"
                    key={example}
                    onClick={() => onCommandTextChange(example)}
                  >
                    <ArrowDownToLine size={12} />
                    {example}
                  </button>
                ))}
              </div>
            )}
            <footer>
              <span>Schoolwork parses locally</span>
              <span>AI handles complex changes</span>
              <span>Rules validate</span>
            </footer>
          </section>
        </div>

  );
}
