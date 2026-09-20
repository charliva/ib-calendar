"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ownsEscape,
  popOverlay,
  pushOverlay,
} from "@/lib/overlay/escape-stack";

type Props = {
  id: string;
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rendered beside the title, for actions that belong to the whole panel. */
  headerAction?: ReactNode;
  /** A panel the student must answer cannot be dismissed by clicking away. */
  dismissOnScrimClick?: boolean;
  className?: string;
  children: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * The app's shared modal surface.
 *
 * Every overlay here used to be hand-rolled — eight of them, each reimplementing
 * scrim dismissal, and only one with a focus trap. This one is portalled to the
 * document body, because below 780px the shell creates its own stacking context
 * and an inline overlay has to win a z-index argument it cannot reliably win.
 */
export function OverlayPanel({
  id,
  open,
  onClose,
  title,
  headerAction,
  dismissOnScrimClick = true,
  className,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    pushOverlay(id);
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    return () => {
      popOverlay(id);
      restoreFocusTo.current?.focus?.();
    };
  }, [id, open]);

  // Focus moves into the panel when it opens, and only then. This used to
  // depend on `onClose`, which callers pass as an inline arrow — so every
  // keystroke produced a new identity, re-ran the effect, and threw focus back
  // to the close button after a single character.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    // Prefer a real field over the close button, so opening a panel lands
    // somewhere useful rather than on the dismiss affordance.
    const preferred = panel.querySelector<HTMLElement>(
      'input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
    );
    const fallback = panel.querySelector<HTMLElement>(FOCUSABLE);
    (preferred ?? fallback ?? panel).focus();
  }, [open]);

  // Held in a ref so the key handler below does not have to re-register every
  // time a caller passes a fresh inline `onClose`.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    function onKeyDown(event: KeyboardEvent) {
      if (!ownsEscape(id)) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel!.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((node) => node.offsetParent !== null);
      if (!focusable.length) return;
      const firstNode = focusable[0];
      const lastNode = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [id, open]);

  if (!open || typeof document === "undefined") return null;

  const titleId = `${id}-title`;

  return createPortal(
    <div
      className="overlay-panel-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (!dismissOnScrimClick) return;
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`overlay-panel${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="overlay-panel-header">
          <h2 id={titleId}>{title}</h2>
          <div className="overlay-panel-header-actions">
            {headerAction}
            <button
              type="button"
              className="overlay-panel-close"
              onClick={onClose}
              aria-label={`Close ${title.toLowerCase()}`}
            >
              ×
            </button>
          </div>
        </header>
        <div className="overlay-panel-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
