"use client";
import { useEffect, useRef, useState } from "react";

export function SelectionDeleteDialog({
  count,
  onDelete,
  onClose,
}: {
  count: number;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const running = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    form.current
      ?.querySelector<HTMLButtonElement>("button[type=submit]")
      ?.focus();
    return () => previous?.focus?.();
  }, []);
  return (
    <div
      className="bulk-delete-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        ref={form}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-title"
        className="bulk-delete-dialog"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" && !busy) onClose();
          if (event.key === "Tab") {
            const buttons = [
              ...(form.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ) ?? []),
            ];
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (buttons.length) {
              event.preventDefault();
              buttons[
                (index + (event.shiftKey ? -1 : 1) + buttons.length) %
                  buttons.length
              ].focus();
            }
          }
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (running.current) return;
          running.current = true;
          setBusy(true);
          setError("");
          try {
            await onDelete();
            onClose();
          } catch {
            setError("Some events could not be deleted. Please try again.");
          } finally {
            running.current = false;
            setBusy(false);
          }
        }}
      >
        <h2 id="bulk-delete-title">Delete {count} events?</h2>
        <p>
          Only selected class occurrences will be removed. Future classes stay
          scheduled.
        </p>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "Deleting…" : "Delete events"}
          </button>
        </footer>
      </form>
    </div>
  );
}
