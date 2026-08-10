export type SwipePoint = {
  x: number;
  y: number;
  at: number;
};

/** Returns 1 for the next calendar period, -1 for the previous one, and 0 for no swipe. */
export function calendarSwipeDirection(
  start: SwipePoint,
  end: SwipePoint,
  options: {
    minimumDistance?: number;
    maximumDuration?: number;
    horizontalBias?: number;
  } = {},
) {
  const minimumDistance = options.minimumDistance ?? 56;
  const maximumDuration = options.maximumDuration ?? 800;
  const horizontalBias = options.horizontalBias ?? 1.25;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const duration = end.at - start.at;

  if (
    duration < 0 ||
    duration > maximumDuration ||
    Math.abs(deltaX) < minimumDistance ||
    Math.abs(deltaX) < Math.abs(deltaY) * horizontalBias
  ) {
    return 0;
  }

  return deltaX < 0 ? 1 : -1;
}

/** Kept for callers that still describe this gesture specifically as a week swipe. */
export const weekSwipeDirection = calendarSwipeDirection;
