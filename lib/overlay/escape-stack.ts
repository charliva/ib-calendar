/**
 * Which overlay currently owns the Escape key.
 *
 * The calendar registers a global keydown handler that resets a dozen pieces of
 * app state at once, which is right for "close whatever is open" but wrong for
 * a guided tour or a settings panel: one stray Escape would close the very
 * thing a coachmark is pointing at. Overlays push themselves onto this stack
 * while they are open, the global handler stands down when the stack is
 * non-empty, and the topmost overlay handles the key itself.
 *
 * A module-level stack rather than React state because the global handler is
 * registered outside the tree that owns these overlays, and threading a flag
 * through it would mean touching every caller.
 */

const stack: string[] = [];

export function pushOverlay(id: string) {
  if (!stack.includes(id)) stack.push(id);
}

export function popOverlay(id: string) {
  const index = stack.lastIndexOf(id);
  if (index >= 0) stack.splice(index, 1);
}

/** True while any overlay wants Escape for itself. */
export function hasBlockingOverlay() {
  return stack.length > 0;
}

/** True when `id` is the overlay that should react to Escape. */
export function ownsEscape(id: string) {
  return stack.at(-1) === id;
}

/** Test seam — the stack outlives any single component. */
export function resetOverlayStack() {
  stack.length = 0;
}
