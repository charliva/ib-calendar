export type FeatureRoadmapState = Set<string>;

const storageKey = "syllabi-feature-roadmap-completed";
const serverState: FeatureRoadmapState = new Set();
const listeners = new Set<() => void>();

let cachedSource: string | null | undefined;
let cachedState: FeatureRoadmapState | undefined;

function parseState(source: string | null): FeatureRoadmapState {
  try {
    const values = source ? (JSON.parse(source) as unknown) : [];
    return new Set(
      Array.isArray(values) ? values.filter((value): value is string => {
        return typeof value === "string";
      }) : [],
    );
  } catch {
    return new Set();
  }
}

export function subscribeFeatureRoadmapState(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function getFeatureRoadmapState(): FeatureRoadmapState {
  const source = window.localStorage.getItem(storageKey);
  if (cachedSource !== source) {
    cachedSource = source;
    cachedState = parseState(source);
  }

  return cachedState ?? new Set();
}

export function getServerFeatureRoadmapState(): FeatureRoadmapState {
  return serverState;
}

export function writeFeatureRoadmapState(state: FeatureRoadmapState) {
  const source = JSON.stringify([...state]);
  window.localStorage.setItem(storageKey, source);
  cachedSource = source;
  cachedState = state;

  listeners.forEach((listener) => listener());
}
