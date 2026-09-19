"use client";

import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  browserAnchorHost,
  watchForAnchor,
} from "@/lib/overlay/anchor";
import { createPortal } from "react-dom";

type Props = {
  /** The `data-tour` value of the element this points at. */
  anchor: string;
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Dim and disable the rest of the page while this step is showing. */
  blocking?: boolean;
  onDismiss?: () => void;
};

/**
 * A bubble anchored to a real element of the app.
 *
 * Anchoring is by `data-tour` marker rather than by class name: the classes on
 * these elements are presentational and get rewritten by the redesign layer, so
 * a tour pinned to them would break silently every time the styling moved.
 *
 * The anchor is tracked with `autoUpdate` rather than measured once. The
 * calendar's scroll container is not the window, and the existing hand-rolled
 * positioner in this app re-measures on resize but not on scroll — which is
 * exactly the case a coachmark pinned to a calendar block runs into.
 */
export function Coachmark({
  anchor,
  open,
  title,
  children,
  footer,
  blocking = false,
  onDismiss,
}: Props) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [missing, setMissing] = useState(false);

  // Named for what it is: floating-ui's own handle object, not a React ref.
  const { refs: floating, floatingStyles } = useFloating({
    open,
    // Fixed, not absolute: the bubble is portalled to <body> while several
    // anchors (the work dock, the rail) are themselves position:fixed. Under
    // the absolute default the computed viewport coordinates were applied
    // relative to the document instead, which mispositioned the bubble and grew
    // the page enough to scroll the whole app out of view.
    strategy: "fixed",
    placement: "bottom-start",
    middleware: [offset(12), flip({ padding: 16 }), shift({ padding: 16 })],
    whileElementsMounted: autoUpdate,
  });

  // Clear the previous step's anchor as the step changes rather than after it
  // has already rendered once pointing at the wrong element.
  const [watching, setWatching] = useState(`${anchor}:${open}`);
  if (watching !== `${anchor}:${open}`) {
    setWatching(`${anchor}:${open}`);
    setTarget(null);
    setMissing(false);
  }

  useEffect(() => {
    if (!open) return;
    return watchForAnchor(browserAnchorHost(), anchor, {
      onFound: (element) => {
        setTarget(element as HTMLElement);
        setMissing(false);
      },
      onMissing: () => setMissing(true),
    });
  }, [anchor, open]);

  useEffect(() => {
    floating.setReference(target);
  }, [floating, target]);

  useEffect(() => {
    if (!target || !open) return;
    target.setAttribute("data-tour-active", "true");
    // A fixed element is already on screen; scrolling to it only drags its
    // ancestors around.
    if (getComputedStyle(target).position !== "fixed") {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    // Block body on purpose: the Workers DOM types make removeAttribute
    // chainable, so a concise arrow would return a value where React expects
    // a cleanup function or nothing.
    return () => {
      target.removeAttribute("data-tour-active");
    };
  }, [open, target]);

  if (!open || typeof document === "undefined") return null;

  // Rather than trap the student in a step pointing at nothing, fall back to a
  // centred card. A missing anchor is a bug, not a reason to block the app.
  const unanchored = missing || !target;

  /* eslint-disable react-hooks/refs -- `floating.setFloating` is floating-ui's
     callback ref, not a React ref object being read during render. The rule
     flags any member expression in a `ref=` attribute, and a JSX attribute
     cannot carry a line-scoped directive. */
  return createPortal(
    <>
      {blocking ? (
        <div
          className="coachmark-scrim"
          role="presentation"
          onMouseDown={onDismiss}
        />
      ) : null}
      <div
        ref={floating.setFloating}
        style={unanchored ? undefined : floatingStyles}
        className={`coachmark${unanchored ? " is-unanchored" : ""}`}
        role="dialog"
        aria-modal={blocking ? "true" : undefined}
        aria-label={title}
      >
        <strong className="coachmark-title">{title}</strong>
        <div className="coachmark-body">{children}</div>
        {footer ? <div className="coachmark-footer">{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}
/* eslint-enable react-hooks/refs */
