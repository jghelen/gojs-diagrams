import { TestDiagram, createTestDiagram } from '../../../testing/diagram-harness';
import { HistoryService } from '../../diagram/history.service';
import { OperationRunner, once } from './operation-runner';

describe('once', () => {
  it('is true for one step at most', () => {
    const condition = once(() => true);
    expect(condition()).toBe(true);
    expect(condition()).toBe(false);
    expect(once(() => false)()).toBe(false);
  });
});

describe('OperationRunner', () => {
  let test: TestDiagram;
  let runner: OperationRunner;
  let history: HistoryService;
  let calls: string[];

  const node = (key: number) => test.model.findNodeDataForKey(key)!;
  /** An operation of one step that renames a node. */
  const rename = (name: string, key: number, title: string) =>
    runner.run(() => ({
      name,
      hasNext: once(() => true),
      step: () => history.record('rename', () => test.model.set(node(key), 'title', title)),
    }));

  beforeEach(() => {
    test = createTestDiagram();
    history = test.history;
    runner = test.injector.get(OperationRunner);
    calls = [];
    runner.connect(test.diagram, {
      beforeEach: () => calls.push('before'),
      afterEach: () => calls.push('after'),
    });
    // As the page does once a loaded diagram is fully shown.
    runner.busy.set(false);
  });

  afterEach(() => vi.restoreAllMocks());

  it('carries out an operation and lists it in the statistics', async () => {
    await rename('Rename one', 1, 'Renamed');
    expect(node(1).title).toBe('Renamed');
    expect(runner.log()).toHaveLength(1);
    const [entry] = runner.log();
    expect(entry).toMatchObject({ op: 'Rename one', steps: 1 });
    expect(entry.changes).toBe(test.model.undoManager.history.last()!.changes.count);
    expect(entry.details.total).toBe(entry.changes);
    expect(entry.totalMs).toBeGreaterThanOrEqual(0);
    expect(entry.avgMs).toBe(entry.totalMs);
  });

  it('lists the newest operation first, each with an id of its own', async () => {
    await rename('First', 1, 'A');
    await rename('Second', 2, 'B');
    expect(runner.log().map((entry) => entry.op)).toEqual(['Second', 'First']);
    expect(new Set(runner.log().map((entry) => entry.id)).size).toBe(2);
  });

  it('runs operations in the order they were asked for, each after the one before', async () => {
    const order: string[] = [];
    const all = ['a', 'b', 'c'].map((name) =>
      runner.run(() => {
        order.push(`plan ${name}`);
        return { name, hasNext: once(() => true), step: () => order.push(`step ${name}`) };
      }),
    );
    await Promise.all(all);
    expect(order).toEqual(['plan a', 'step a', 'plan b', 'step b', 'plan c', 'step c']);
  });

  it('counts the steps of an operation that takes several', async () => {
    let remaining = 3;
    await runner.run(() => ({
      name: 'Three renames',
      hasNext: () => remaining > 0,
      step: () => {
        remaining--;
        history.record('rename', () => test.model.set(node(1), 'title', `Run ${remaining}`));
      },
    }));
    expect(runner.log()[0]).toMatchObject({ op: 'Three renames', steps: 3 });
    expect(history.length).toBe(3);
  });

  it('lists nothing for an operation that had nothing to do', async () => {
    await runner.run(() => ({ name: 'Nothing', hasNext: () => false, step: () => undefined }));
    expect(runner.log()).toEqual([]);
  });

  it('tells the page before and after each operation, and is busy only in between', async () => {
    const seen: boolean[] = [];
    await runner.run(() => ({
      name: 'Look',
      hasNext: once(() => true),
      step: () => seen.push(runner.busy(), runner.isMeasuring),
    }));
    expect(calls).toEqual(['before', 'after']);
    expect(seen).toEqual([true, true]);
    expect(runner.busy()).toBe(false);
    expect(runner.isMeasuring).toBe(false);
  });

  it('does nothing while a diagram is still loading', async () => {
    runner.busy.set(true);
    await rename('Too early', 1, 'Renamed');
    expect(node(1).title).not.toBe('Renamed');
    expect(runner.log()).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('recovers when an operation fails: its changes are undone and a notice is set', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const title = node(1).title;
    await runner.run(() => ({
      name: 'Doomed',
      hasNext: once(() => true),
      step: () => {
        test.model.startTransaction('doomed');
        test.model.set(node(1), 'title', 'Half done');
        throw new Error('boom');
      },
    }));
    expect(node(1).title).toBe(title);
    expect(history.hasUnfinishedTransaction).toBe(false);
    expect(runner.failure()).toContain('could not be completed and was undone');
    expect(runner.busy()).toBe(false);
    expect(runner.log()).toEqual([]);
    expect(calls).toEqual(['before', 'after']);
  });

  it('takes the notice away with the next operation, and goes on working', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await runner.run(() => ({
      name: 'Doomed',
      hasNext: once(() => true),
      step: () => {
        throw new Error('boom');
      },
    }));
    await rename('Fine', 1, 'Renamed');
    expect(runner.failure()).toBeNull();
    expect(node(1).title).toBe('Renamed');
  });

  it('closes a transaction that was left open before it starts the next operation', async () => {
    test.model.startTransaction('left open');
    await rename('After', 1, 'Renamed');
    expect(history.hasUnfinishedTransaction).toBe(false);
    expect(history.length).toBe(1);
  });

  it('empties the statistics on request', async () => {
    await rename('One', 1, 'A');
    runner.clearLog();
    expect(runner.log()).toEqual([]);
  });
});
