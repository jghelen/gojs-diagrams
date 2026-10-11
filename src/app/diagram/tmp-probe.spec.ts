import { createTestDiagram, linksOf } from '../../testing/diagram-harness';

describe('probe', () => {
  it('what is slow', () => {
    const out: Record<string, unknown> = {};
    const t0 = performance.now();
    const test = createTestDiagram({ count: 200, linkType: 'avoid' });
    out['load'] = Math.round(performance.now() - t0);
    const m = test.model;
    const run = (name: string, work: () => void) => {
      const before = linksOf(test.diagram).map((l) => l.points);
      const a = performance.now();
      work();
      const b = performance.now();
      for (let i = 0; i < 3; i++) test.diagram.maybeUpdate();
      const c = performance.now();
      const changed = linksOf(test.diagram).filter((l, i) => l.points !== before[i]).length;
      out[name] = { work: Math.round(b - a), update: Math.round(c - b), newPointLists: changed };
    };
    run('title', () => m.commit((mm) => mm.nodeDataArray.forEach((n) => mm.set(n, 'title', 'X ' + n.title)), 't'));
    run('color', () => m.commit((mm) => mm.nodeDataArray.forEach((n) => mm.set(n, 'color', '#1e3a8a')), 'c'));
    run('shape', () => m.commit((mm) => mm.nodeDataArray.forEach((n) => mm.set(n, 'shape', 'Diamond')), 's'));
    run('undo shape', () => m.undoManager.undo());
    run('redo shape', () => m.undoManager.redo());
    run('undo shape again', () => m.undoManager.undo());
    run('undo color', () => m.undoManager.undo());
    out['links'] = linksOf(test.diagram).length;
    expect(out).toEqual({});
  });
});
