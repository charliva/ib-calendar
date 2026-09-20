/**
 * Finding the element a tour step points at.
 *
 * Several anchors live inside views that are code-split, so when a step opens
 * the element genuinely does not exist yet — the chunk still has to be fetched
 * and mounted. An early version polled for about a second and then gave up,
 * which meant the step that sends a student to the School workspace reliably
 * rendered as an unanchored card instead of pointing at anything.
 *
 * The browser plumbing is injected so this can be exercised without a DOM.
 */

export type AnchorHost = {
  /** Look the element up now. */
  find: (selector: string) => unknown | null;
  /** Watch for tree changes; returns an unsubscribe. */
  observe: (onMutate: () => void) => () => void;
  setTimer: (callback: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
};

export type AnchorHandlers = {
  onFound: (element: unknown) => void;
  /** The anchor never appeared; the step should fall back to a centred card. */
  onMissing: () => void;
};

/**
 * How long to wait before giving up. Generous on purpose: showing an unanchored
 * card too early is a worse failure than a brief pause, and the element may be
 * behind a lazily loaded chunk on a slow connection.
 */
export const ANCHOR_WAIT_MS = 10_000;

export function anchorSelector(anchor: string) {
  return `[data-tour="${anchor}"]`;
}

/**
 * Resolve an anchor, now or as soon as it is mounted.
 * Returns a cleanup that stops all watching.
 */
export function watchForAnchor(
  host: AnchorHost,
  anchor: string,
  handlers: AnchorHandlers,
  budgetMs: number = ANCHOR_WAIT_MS,
): () => void {
  const selector = anchorSelector(anchor);

  const immediate = host.find(selector);
  if (immediate) {
    handlers.onFound(immediate);
    return () => {};
  }

  let settled = false;
  let timer: number | null = null;

  const stopObserving = host.observe(() => {
    if (settled) return;
    const element = host.find(selector);
    if (!element) return;
    settled = true;
    stopObserving();
    if (timer !== null) host.clearTimer(timer);
    handlers.onFound(element);
  });

  timer = host.setTimer(() => {
    if (settled) return;
    settled = true;
    stopObserving();
    handlers.onMissing();
  }, budgetMs);

  return () => {
    settled = true;
    stopObserving();
    if (timer !== null) host.clearTimer(timer);
  };
}

/** The real browser, wired to the module above. */
export function browserAnchorHost(): AnchorHost {
  return {
    find: (selector) => document.querySelector(selector),
    observe: (onMutate) => {
      const observer = new MutationObserver(onMutate);
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
    setTimer: (callback, ms) => window.setTimeout(callback, ms),
    clearTimer: (id) => window.clearTimeout(id),
  };
}
