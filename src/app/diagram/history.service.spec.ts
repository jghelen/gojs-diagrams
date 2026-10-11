import * as go from 'gojs/release/go';
import { TestDiagram, createHistory, createTestDiagram } from '../../testing/diagram-harness';
import { createModel } from './diagram-factory';
import { HistoryService, withoutUndo } from './history.service';
import { createLinks, createNodes } from './node-data';

describe('HistoryService', () => {
  let test: TestDiagram;
  let history: HistoryService;

  const node = (key: number) => test.model.findNodeDataForKey(key)!;
  /** Records one transaction that gives a node a new title. */
  const rename = (key: number, title: string) =>
    history.record('rename', () => test.model.set(node(key), 'title', title));

  beforeEach(() => {
    test = createTestDiagram();
    history = test.history;
  });

  describe('a newly loaded diagram', () => {
    it('has an empty history at position -1, with nothing to undo or redo', () => {
      expect(history.length).toBe(0);
      expect(history.position).toBe(-1);
      expect(history.canUndo).toBe(false);
      expect(history.canRedo).toBe(false);
      expect(history.recordedChanges).toBe(0);
    });

    it('records changes, and without the limit of 999 steps that GoJS has by default', () => {
      expect(test.model.undoManager.isEnabled).toBe(true);
      expect(test.model.undoManager.maxHistoryLength).toBe(-1);
      for (let i = 0; i < 1005; i++) rename(1, `Name ${i}`);
      expect(history.length).toBe(1005);
    });

    it('starts over when other data is loaded', () => {
      rename(1, 'Changed');
      const model = createModel(
        { nodes: createNodes(5), links: createLinks(5) },
        {
          layoutType: 'grid',
          linkType: 'straight',
          name: 'Other',
          description: '',
          cardsExpanded: false,
          subtitleField: null,
        },
      );
      history.load(model);
      test.settle();
      expect(test.diagram.model).toBe(model);
      expect(history.length).toBe(0);
      expect(history.position).toBe(-1);
      expect(model.undoManager.maxHistoryLength).toBe(-1);
      expect(history.describeState().label).toBe('Waiting for the initial layout');
    });
  });

  describe('record', () => {
    it('makes one undo step of everything the change does', () => {
      const before = [node(1).title, node(2).title, node(3).color];
      history.record('three edits', () => {
        test.model.set(node(1), 'title', 'First');
        test.model.set(node(2), 'title', 'Second');
        test.model.set(node(3), 'color', '#1e3a8a');
      });
      expect(history.length).toBe(1);
      expect(history.position).toBe(0);
      expect(history.canUndo).toBe(true);

      history.undo();
      expect([node(1).title, node(2).title, node(3).color]).toEqual(before);
      expect(history.position).toBe(-1);
    });

    it('names the transaction', () => {
      rename(1, 'Changed');
      expect(test.model.undoManager.history.last()!.name).toBe('rename');
    });

    it('records changes to the diagram itself as well as to its data', () => {
      const moved = test.diagram.findNodeForKey(1)!;
      const before = moved.location.copy();
      history.record('move', () => (moved.location = new go.Point(before.x + 500, before.y)));
      history.undo();
      expect(moved.location.equals(before)).toBe(true);
    });

    it('records nothing, and takes back what was done, when the change fails halfway', () => {
      const title = node(1).title;
      expect(() =>
        history.record('doomed', () => {
          test.model.set(node(1), 'title', 'Half done');
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(node(1).title).toBe(title);
      expect(history.length).toBe(0);
      expect(history.hasUnfinishedTransaction).toBe(false);
    });
  });

  describe('undo and redo', () => {
    it('step one transaction back and forward', () => {
      const original = node(1).title;
      rename(1, 'One');
      rename(1, 'Two');

      history.undo();
      expect(node(1).title).toBe('One');
      expect(history.position).toBe(0);
      expect(history.canRedo).toBe(true);

      history.undo();
      expect(node(1).title).toBe(original);
      expect(history.position).toBe(-1);
      expect(history.canUndo).toBe(false);

      history.redo();
      history.redo();
      expect(node(1).title).toBe('Two');
      expect(history.position).toBe(1);
      expect(history.canRedo).toBe(false);
    });

    it('do nothing at either end of the history', () => {
      history.undo();
      expect(history.position).toBe(-1);
      rename(1, 'One');
      history.redo();
      expect(history.position).toBe(0);
      expect(node(1).title).toBe('One');
    });

    it('keep the length of the history: undone transactions stay, to be redone', () => {
      rename(1, 'One');
      rename(1, 'Two');
      history.undo();
      expect(history.length).toBe(2);
      expect(history.position).toBe(0);
    });

    it('lose the undone transactions as soon as a new change is recorded', () => {
      rename(1, 'One');
      rename(1, 'Two');
      rename(1, 'Three');
      history.undo();
      history.undo();
      rename(1, 'Other');
      expect(history.length).toBe(2);
      expect(history.position).toBe(1);
      expect(history.canRedo).toBe(false);
      expect(node(1).title).toBe('Other');
    });
  });

  describe('reading the history', () => {
    it('counts the single changes of all transactions together', () => {
      rename(1, 'One');
      const afterOne = history.recordedChanges;
      expect(afterOne).toBeGreaterThanOrEqual(1);
      rename(2, 'Two');
      expect(history.recordedChanges).toBeGreaterThan(afterOne);
      // Undoing removes nothing from the history.
      history.undo();
      expect(history.recordedChanges).toBeGreaterThan(afterOne);
    });

    describe('transactionsBetween', () => {
      const names = (a: number, b: number) =>
        history.transactionsBetween(a, b).map((transaction) => transaction.name);

      beforeEach(() => {
        for (const name of ['T0', 'T1', 'T2', 'T3']) {
          history.record(name, () => test.model.set(node(1), 'title', name));
        }
      });

      it('gives the one transaction that was just recorded', () => {
        expect(names(2, 3)).toEqual(['T3']);
      });

      it('gives the one transaction that an undo took back', () => {
        const before = history.position;
        history.undo();
        expect(names(before, history.position)).toEqual(['T3']);
      });

      it('gives all of them for undoing or redoing everything, oldest first', () => {
        expect(names(3, -1)).toEqual(['T0', 'T1', 'T2', 'T3']);
        expect(names(-1, 3)).toEqual(['T0', 'T1', 'T2', 'T3']);
      });

      it('gives none when the position did not move', () => {
        expect(names(2, 2)).toEqual([]);
      });

      it('gives the new transaction when it replaced undone ones', () => {
        history.undo();
        history.undo();
        const before = history.position;
        history.record('New', () => test.model.set(node(1), 'title', 'New'));
        expect(names(before, history.position)).toEqual(['New']);
      });

      it('stops at the end of the history', () => {
        expect(names(1, 99)).toEqual(['T2', 'T3']);
      });
    });
  });

  describe('describeState', () => {
    const INITIAL = { label: 'Initial state: matches the startup snapshot', ok: true };
    const LATEST = { label: 'Latest state: matches the snapshot taken before undo', ok: true };

    it('confirms the initial state of a diagram that was not changed', () => {
      expect(history.describeState()).toEqual(INITIAL);
    });

    it('says how far into the history the diagram is while there is something to redo', () => {
      rename(1, 'One');
      rename(1, 'Two');
      rename(1, 'Three');
      history.undo();
      expect(history.describeState()).toEqual({ label: 'Transaction 2 of 3', ok: null });
    });

    it('confirms the initial state again after everything was undone', () => {
      rename(1, 'One');
      rename(2, 'Two');
      history.undo();
      history.undo();
      expect(history.describeState()).toEqual(INITIAL);
    });

    it('has nothing to compare the newest state with before an undo led away from it', () => {
      rename(1, 'One');
      expect(history.describeState()).toEqual({ label: 'Latest state', ok: null });
    });

    it('confirms the newest state after everything was undone and redone', () => {
      rename(1, 'One');
      rename(2, 'Two');
      history.rememberLatestState();
      history.undo();
      history.undo();
      history.redo();
      history.redo();
      expect(history.describeState()).toEqual(LATEST);
    });

    it('reports a difference when the diagram is not what it was', () => {
      rename(1, 'One');
      history.undo();
      // A change behind the back of the history: undo cannot have restored this.
      withoutUndo(test.diagram, () => test.model.set(node(1), 'title', 'Tampered'));
      expect(history.describeState()).toEqual({
        label: 'Initial state: differs from the startup snapshot',
        ok: false,
      });
    });

    it('reports a difference at the newest state too', () => {
      rename(1, 'One');
      history.rememberLatestState();
      history.undo();
      history.redo();
      withoutUndo(test.diagram, () => test.model.set(node(1), 'title', 'Tampered'));
      expect(history.describeState()).toEqual({
        label: 'Latest state: differs from the snapshot taken before undo',
        ok: false,
      });
    });
  });

  describe('rememberLatestState', () => {
    const LATEST_UNKNOWN = { label: 'Latest state', ok: null };

    it('saves nothing while the diagram is not at its newest state', () => {
      rename(1, 'One');
      rename(1, 'Two');
      history.undo();
      history.rememberLatestState();
      history.redo();
      expect(history.describeState()).toEqual(LATEST_UNKNOWN);
    });

    it('is forgotten when a new change is recorded, since the newest state is another one then', () => {
      rename(1, 'One');
      history.rememberLatestState();
      rename(1, 'Two');
      expect(history.describeState()).toEqual(LATEST_UNKNOWN);
    });

    it('is forgotten as well when GoJS records a change by itself, such as a drag', () => {
      rename(1, 'One');
      history.rememberLatestState();
      test.diagram.commit((d) => d.model.set(node(2), 'title', 'By GoJS'), 'drag');
      expect(history.describeState()).toEqual(LATEST_UNKNOWN);
    });

    it('keeps the first snapshot while stepping back and forth', () => {
      rename(1, 'One');
      rename(1, 'Two');
      history.rememberLatestState();
      history.undo();
      history.rememberLatestState();
      history.redo();
      expect(history.describeState().ok).toBe(true);
    });
  });

  describe('connect', () => {
    let changes: number;
    let watching: HistoryService;

    beforeEach(() => {
      changes = 0;
      watching = createHistory();
      watching.connect(test.diagram, () => changes++);
    });

    it('reports once per recorded transaction, not once per change in it', () => {
      watching.record('three edits', () => {
        test.model.set(node(1), 'title', 'One');
        test.model.set(node(2), 'title', 'Two');
        test.model.set(node(3), 'title', 'Three');
      });
      expect(changes).toBe(1);
    });

    it('reports an undo and a redo', () => {
      watching.record('edit', () => test.model.set(node(1), 'title', 'One'));
      changes = 0;
      watching.undo();
      expect(changes).toBe(1);
      watching.redo();
      expect(changes).toBe(2);
    });

    it('reports transactions that GoJS commits by itself', () => {
      test.diagram.commit((d) => d.model.set(node(1), 'title', 'By GoJS'), 'text edit');
      expect(changes).toBe(1);
    });
  });

  describe('sendShortcutsTo', () => {
    it('makes Ctrl+Z and Ctrl+Y call the given functions instead of undoing directly', () => {
      rename(1, 'One');
      const calls: string[] = [];
      history.sendShortcutsTo(
        () => calls.push('undo'),
        () => calls.push('redo'),
      );
      test.diagram.commandHandler.undo();
      test.diagram.commandHandler.redo();
      expect(calls).toEqual(['undo', 'redo']);
      // Nothing was undone behind the page's back.
      expect(history.position).toBe(0);
    });
  });

  describe('an unfinished transaction', () => {
    it('is noticed', () => {
      expect(history.hasUnfinishedTransaction).toBe(false);
      test.model.startTransaction('left open');
      expect(history.hasUnfinishedTransaction).toBe(true);
    });

    it('is rolled back with its changes, after which recording and undo work again', () => {
      const title = node(1).title;
      test.model.startTransaction('left open');
      test.model.set(node(1), 'title', 'Half done');

      expect(history.rollBackUnfinished()).toBe(true);
      expect(history.hasUnfinishedTransaction).toBe(false);
      expect(node(1).title).toBe(title);
      expect(history.length).toBe(0);

      rename(1, 'After');
      expect(history.length).toBe(1);
      history.undo();
      expect(node(1).title).toBe(title);
    });

    it('is rolled back however deeply transactions were nested', () => {
      test.model.startTransaction('outer');
      test.model.startTransaction('inner');
      expect(history.rollBackUnfinished()).toBe(true);
      expect(history.hasUnfinishedTransaction).toBe(false);
    });

    it('is left alone while a drag or a text edit is under way', () => {
      test.diagram.currentTool = test.diagram.toolManager.textEditingTool;
      test.model.startTransaction('the tool is working');
      expect(history.rollBackUnfinished()).toBe(false);
      expect(history.hasUnfinishedTransaction).toBe(true);
      test.model.commitTransaction('the tool is working');
      test.diagram.currentTool = test.diagram.defaultTool;
    });

    it('needs nothing done when there is none', () => {
      expect(history.rollBackUnfinished()).toBe(true);
    });
  });
});

describe('withoutUndo', () => {
  it('makes a change that the history does not record', () => {
    const { diagram, model, history } = createTestDiagram();
    const data = model.findNodeDataForKey(1)!;
    withoutUndo(diagram, () => model.set(data, 'title', 'Not recorded'));
    expect(data.title).toBe('Not recorded');
    expect(history.length).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  it('records again afterwards, also when the change failed', () => {
    const { diagram, model, history } = createTestDiagram();
    const data = model.findNodeDataForKey(1)!;
    expect(() =>
      withoutUndo(diagram, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(diagram.skipsUndoManager).toBe(false);
    history.record('edit', () => model.set(data, 'title', 'Recorded'));
    expect(history.length).toBe(1);
  });

  it('can be used inside itself', () => {
    const { diagram } = createTestDiagram();
    withoutUndo(diagram, () => {
      withoutUndo(diagram, () => undefined);
      expect(diagram.skipsUndoManager).toBe(true);
    });
    expect(diagram.skipsUndoManager).toBe(false);
  });
});
