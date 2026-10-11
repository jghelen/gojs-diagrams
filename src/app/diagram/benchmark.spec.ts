import { afterNextPaint, timeSteps } from './benchmark';

describe('timeSteps', () => {
  it('runs the step for as long as there is a next one', () => {
    let remaining = 5;
    let calls = 0;
    const stats = timeSteps(
      () => remaining > 0,
      () => {
        remaining--;
        calls++;
      },
    );
    expect(calls).toBe(5);
    expect(stats.steps).toBe(5);
  });

  it('reports a total that covers the slowest and the fastest step', () => {
    let remaining = 3;
    const stats = timeSteps(
      () => remaining-- > 0,
      () => {
        for (let i = 0; i < 20_000; i++) Math.sqrt(i);
      },
    );
    expect(stats.minMs).toBeLessThanOrEqual(stats.maxMs);
    expect(stats.totalMs).toBeGreaterThanOrEqual(stats.maxMs);
    expect(stats.totalMs).toBeLessThanOrEqual(stats.maxMs * stats.steps + 1e-6);
  });

  it('reports zeros when there is nothing to do', () => {
    expect(
      timeSteps(
        () => false,
        () => undefined,
      ),
    ).toEqual({ steps: 0, totalMs: 0, minMs: 0, maxMs: 0 });
  });
});

describe('afterNextPaint', () => {
  const setHidden = (hidden: boolean) =>
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

  afterEach(() => setHidden(true));

  it('answers null at once when the page is hidden, because no frame will be painted', async () => {
    setHidden(true);
    expect(await afterNextPaint()).toBeNull();
  });

  it('answers with the time of the next frame when the page is visible', async () => {
    setHidden(false);
    const before = performance.now();
    const painted = await afterNextPaint();
    expect(painted).not.toBeNull();
    expect(painted!).toBeGreaterThanOrEqual(before);
  });
});
