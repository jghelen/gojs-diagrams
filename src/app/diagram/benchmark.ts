export interface StepStats {
  steps: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

/** Runs `step` while `hasNext` is true, timing every call synchronously. */
export function timeSteps(hasNext: () => boolean, step: () => void): StepStats {
  let steps = 0;
  let totalMs = 0;
  let minMs = Infinity;
  let maxMs = 0;
  while (hasNext()) {
    const start = performance.now();
    step();
    const elapsed = performance.now() - start;
    steps++;
    totalMs += elapsed;
    if (elapsed < minMs) minMs = elapsed;
    if (elapsed > maxMs) maxMs = elapsed;
  }
  return { steps, totalMs, minMs: steps ? minMs : 0, maxMs };
}

/**
 * Resolves with performance.now() once the browser has painted the next frame.
 * GoJS redraws its canvas in a requestAnimationFrame callback, so this is when
 * the result of an undo/redo is actually on screen.
 * Resolves with null when the tab is hidden, because no frame is painted then.
 */
export function afterNextPaint(): Promise<number | null> {
  if (document.hidden) return Promise.resolve(null);
  return new Promise((resolve) => {
    const fallback = setTimeout(() => resolve(null), 1000);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(fallback);
        resolve(performance.now());
      }),
    );
  });
}
