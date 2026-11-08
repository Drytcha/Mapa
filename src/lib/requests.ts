export function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createRequestGate(interval: number) {
  let tail: Promise<void> = Promise.resolve();
  let lastStarted = 0;
  return function schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const result = tail.then(async () => {
      await waitFor(Math.max(0, lastStarted + interval - Date.now()), signal);
      lastStarted = Date.now();
      return task();
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

// These gates share one queue across all fields and route batches in this tab.
export const withGeocodingSlot = createRequestGate(1100);
export const withRoutingSlot = createRequestGate(1100);
// Overpass is a separate service with its own limits: it must never delay routing.
export const withOverpassSlot = createRequestGate(2200);