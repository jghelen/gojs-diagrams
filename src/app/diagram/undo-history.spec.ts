import * as go from 'gojs/release/go';
import { createTestDiagram, linksOf } from '../../testing/diagram-harness';
import { createLayout } from './layouts';
import { EDITABLE_FIELDS, LinkData, NodeData, randomPatch } from './node-data';

/** Undoes or redoes for as long as possible and says how many steps that took. */
function all(step: () => void, can: () => boolean): number {
  let steps = 0;
  for (; can(); steps++) step();
  return steps;
}

describe('undo history', () => {
  it('is enabled, unlimited and empty once the diagram is laid out', () => {
    const { model } = createTestDiagram();
    const history = model.undoManager;
    expect(history.isEnabled).toBe(true);
    expect(history.maxHistoryLength).toBe(-1);
    expect(history.history.count).toBe(0);
    expect(history.canUndo()).toBe(false);
  });

  it('restores every field of every node, all the way back to the start', () => {
    const { model, settle } = createTestDiagram();
    const initial = model.toJson();
    const history = model.undoManager;

    for (let run = 0; run < 10; run++) {
      model.commit((m) => {
        for (const node of m.nodeDataArray as NodeData[]) {
          const patch = randomPatch(node);
          for (const field of EDITABLE_FIELDS) m.set(node, field, patch[field]);
        }
      }, 'randomize');
    }
    settle();
    const latest = model.toJson();
    expect(history.history.count).toBe(10);
    expect(latest).not.toBe(initial);

    expect(
      all(
        () => history.undo(),
        () => history.canUndo(),
      ),
    ).toBe(10);
    expect(model.toJson()).toBe(initial);
    expect(history.historyIndex).toBe(-1);

    expect(
      all(
        () => history.redo(),
        () => history.canRedo(),
      ),
    ).toBe(10);
    expect(model.toJson()).toBe(latest);
  });

  it('steps through single changes one at a time', () => {
    const { model } = createTestDiagram();
    const node = model.nodeDataArray[0];
    const original = node.title;
    model.commit((m) => m.set(node, 'title', 'First'), 'edit');
    model.commit((m) => m.set(node, 'title', 'Second'), 'edit');

    model.undoManager.undo();
    expect(node.title).toBe('First');
    model.undoManager.undo();
    expect(node.title).toBe(original);
    model.undoManager.redo();
    expect(node.title).toBe('First');
  });

  it('keeps more than the 999 transactions GoJS would keep by default', () => {
    const { model } = createTestDiagram();
    const initial = model.toJson();
    const node = model.nodeDataArray[0];
    for (let i = 0; i < 1100; i++) model.commit((m) => m.set(node, 'comment', `note ${i}`), 'edit');

    const history = model.undoManager;
    expect(history.history.count).toBe(1100);
    expect(
      all(
        () => history.undo(),
        () => history.canUndo(),
      ),
    ).toBe(1100);
    expect(model.toJson()).toBe(initial);
  });

  it('drops the redo side when a new change is made after an undo', () => {
    const { model } = createTestDiagram();
    const node = model.nodeDataArray[0];
    model.commit((m) => m.set(node, 'title', 'First'), 'edit');
    model.commit((m) => m.set(node, 'title', 'Second'), 'edit');
    model.undoManager.undo();
    model.commit((m) => m.set(node, 'title', 'Other'), 'edit');

    expect(model.undoManager.canRedo()).toBe(false);
    expect(model.undoManager.history.count).toBe(2);
  });

  it('undoes a comment like any other field', () => {
    const { model } = createTestDiagram();
    const node = model.nodeDataArray[3];
    model.commit((m) => m.set(node, 'comment', 'Check this fund'), 'edit comment');
    expect(node.comment).toBe('Check this fund');
    model.undoManager.undo();
    expect(node.comment).toBe('');
  });

  it('undoes a switch of layout and line type, which live in the model', () => {
    const { diagram, model, settle } = createTestDiagram();
    const initial = model.toJson();

    diagram.commit((d) => {
      d.model.set(d.model.modelData, 'layoutType', 'grid');
      const layout = createLayout('grid', d.nodes.count);
      d.layout = layout;
      layout.isValidLayout = false;
    }, 'change layout');
    model.commit((m) => m.set(m.modelData, 'linkType', 'straight'), 'change line type');
    settle();
    expect(model.modelData.layoutType).toBe('grid');
    expect(model.modelData.linkType).toBe('straight');
    expect(model.toJson()).not.toBe(initial);

    model.undoManager.undo();
    model.undoManager.undo();
    expect(model.modelData.layoutType).toBe('top-bottom');
    expect(model.modelData.linkType).toBe('avoid');
    expect(model.toJson()).toBe(initial);
  });

  it('puts moved nodes back to exactly the same place on redo, down to the last digit', () => {
    // A layout like the circle puts nodes at places with many decimals. GoJS keeps a
    // node's top left corner, the data keeps its middle, and going from one to the
    // other and back can change the last digit. That must not show as a difference.
    for (const layout of ['circle', 'force'] as const) {
      const test = createTestDiagram({ count: 30 });
      test.history.record('change layout', () => {
        test.model.set(test.model.modelData, 'layoutType', layout);
        const next = createLayout(layout, 30);
        test.diagram.layout = next;
        next.isValidLayout = false;
      });
      test.settle();
      const arranged = test.model.toJson();

      test.history.undo();
      test.settle();
      test.history.redo();
      test.settle();
      expect(test.model.toJson()).toBe(arranged);
    }
  });

  it('keeps the place of a node exactly, through any number of undos and redos', () => {
    const test = createTestDiagram({ count: 5 });
    const node = test.diagram.findNodeForKey(3)!;
    const data = node.data as NodeData;
    // The numbers that once came back different in their last digit after a redo.
    test.diagram.commit(() => {
      node.location = new go.Point(840.4155888772582, 240.75846260198898);
    }, 'move');
    const stored = data.loc;
    // The data says where the corner is, with every digit GoJS has for it.
    expect(stored).toBe(go.Point.stringify(node.position));

    for (let i = 0; i < 6; i++) {
      test.history.undo();
      expect(data.loc).not.toBe(stored);
      test.history.redo();
      expect(data.loc).toBe(stored);
      expect(go.Point.stringify(node.position)).toBe(stored);
    }
  });

  it('brings a deleted node back together with its relationships', () => {
    const { diagram, model, settle } = createTestDiagram();
    const initial = model.toJson();
    const node = diagram.findNodeForKey(5)!;
    const attached = node.findLinksConnected().count;
    expect(attached).toBeGreaterThan(0);
    const linksBefore = model.linkDataArray.length;

    // What the app does on delete: the node goes, and its relationships with it.
    model.commit(() => {
      model.removeLinkDataCollection(
        model.linkDataArray.filter((link) => link.from === 5 || link.to === 5),
      );
      model.removeNodeData(node.data);
    }, 'delete');
    settle();
    expect(diagram.findNodeForKey(5)).toBeNull();
    expect(model.linkDataArray).toHaveLength(linksBefore - attached);
    expect(model.nodeDataArray).toHaveLength(29);

    model.undoManager.undo();
    settle();
    expect(diagram.findNodeForKey(5)!.findLinksConnected().count).toBe(attached);
    expect(model.toJson()).toBe(initial);
  });

  it('undoes added and removed relationships', () => {
    const { diagram, model, settle } = createTestDiagram();
    const initial = model.toJson();
    const linksBefore = model.linkDataArray.length;

    const removed = linksOf(diagram)
      .slice(0, 3)
      .map((link) => link.data as LinkData);
    model.commit((m) => (m as typeof model).removeLinkDataCollection(removed), 'remove');
    model.commit(
      (m) => (m as typeof model).addLinkData({ key: 9001, from: 2, to: 29, category: 'manual' }),
      'add',
    );
    settle();
    expect(model.linkDataArray).toHaveLength(linksBefore - 3 + 1);

    model.undoManager.undo();
    model.undoManager.undo();
    expect(model.toJson()).toBe(initial);
  });

  it('undoes an added node', () => {
    const { model } = createTestDiagram();
    const initial = model.toJson();
    model.commit(
      (m) =>
        m.addNodeData({
          key: 31,
          title: 'New fund 31',
          legalEntityType: 'Private equity',
          shape: 'Rectangle',
          color: '#f3f4f6',
          comment: '',
        }),
      'add node',
    );
    expect(model.nodeDataArray).toHaveLength(31);
    model.undoManager.undo();
    expect(model.toJson()).toBe(initial);
  });
});
