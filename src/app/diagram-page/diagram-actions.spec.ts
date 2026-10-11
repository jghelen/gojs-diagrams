import * as go from 'gojs/release/go';
import {
  TestDiagram,
  countLinksOverNodes,
  countNodeOverlaps,
  createTestDiagram,
  linksOf,
  nodesOf,
} from '../../testing/diagram-harness';
import { NODE_NUDGE, QUICK_LAYOUTS } from '../diagram/constants';
import { LAYOUTS } from '../diagram/layouts';
import { allLinkCardsShown } from '../diagram/diagram-factory';
import { DiagramActions } from './diagram-actions';
import { OperationRunner } from './operation-runner';

describe('DiagramActions', () => {
  let test: TestDiagram;
  let actions: DiagramActions;
  let runner: OperationRunner;

  const node = (key: number) => test.model.findNodeDataForKey(key)!;
  const lastOp = () => runner.log()[0];
  const places = () => nodesOf(test.diagram).map((part) => part.location.toString());

  beforeEach(() => {
    test = createTestDiagram();
    runner = test.injector.get(OperationRunner);
    runner.connect(test.diagram, { beforeEach: () => undefined, afterEach: () => undefined });
    // As the page does once a loaded diagram is fully shown.
    runner.busy.set(false);
    actions = test.injector.get(DiagramActions);
    actions.connect(test.diagram);
  });

  describe('editing nodes', () => {
    it('sets a field on the picked nodes as one undo step', async () => {
      await actions.setField(() => [node(1), node(2), node(3)], 'color', '#1e3a8a');
      for (const key of [1, 2, 3]) expect(node(key).color).toBe('#1e3a8a');
      expect(test.history.length).toBe(1);
      expect(lastOp()).toMatchObject({ op: 'Set color on 3 nodes', steps: 1 });
    });

    it('leaves out the nodes that already have the value, and does nothing when all have it', async () => {
      await actions.setField(() => [node(1)], 'color', '#1e3a8a');
      await actions.setField(() => [node(1), node(2)], 'color', '#1e3a8a');
      expect(lastOp().op).toBe('Set color on 1 node');
      await actions.setField(() => [node(1), node(2)], 'color', '#1e3a8a');
      expect(test.history.length).toBe(2);
      expect(runner.log()).toHaveLength(2);
    });

    it('stores a comment', async () => {
      await actions.setField(() => [node(4)], 'comment', 'Check the stake');
      expect(node(4).comment).toBe('Check the stake');
      expect(lastOp().op).toBe('Set comment on 1 node');
    });

    it('randomizes the picked nodes, one undo step per run', async () => {
      const before = test.model.nodeDataArray.map((data) => data.title);
      await actions.randomize('3 × randomize all nodes', 3, (all) => all);
      expect(test.history.length).toBe(3);
      expect(lastOp()).toMatchObject({ op: '3 × randomize all nodes', steps: 3 });
      expect(test.model.nodeDataArray.map((data) => data.title)).not.toEqual(before);
    });

    describe('randomizing with a move', () => {
      const places = () =>
        new Map(nodesOf(test.diagram).map((part) => [part.key as number, part.location.copy()]));
      const furthest = (from: Map<number, go.Point>) =>
        Math.max(
          ...nodesOf(test.diagram).map((part) => {
            const start = from.get(part.key as number)!;
            return Math.max(
              Math.abs(part.location.x - start.x),
              Math.abs(part.location.y - start.y),
            );
          }),
        );

      it('leaves the nodes where they are unless asked to move them', async () => {
        const before = places();
        await actions.randomize('Randomize all nodes', 1, (all) => all);
        test.settle();
        expect(furthest(before)).toBe(0);
      });

      it('moves every node a little, as part of the same undo step', async () => {
        const before = places();
        await actions.randomize('Randomize all nodes', 1, (all) => all, { move: true });
        test.settle();
        for (const part of nodesOf(test.diagram)) {
          expect(part.location.equalsApprox(before.get(part.key as number)!)).toBe(false);
        }
        expect(furthest(before)).toBeLessThanOrEqual(NODE_NUDGE);
        expect(test.history.length).toBe(1);
        // The data says where the node is, like after a drag.
        expect(
          go.Point.parse(node(1).loc!).equalsApprox(test.diagram.findNodeForKey(1)!.position),
        ).toBe(true);
      });

      it('never moves a node further than that from where it first stood, however often', async () => {
        const before = places();
        await actions.randomize('40 × randomize all nodes', 40, (all) => all, { move: true });
        test.settle();
        expect(test.history.length).toBe(40);
        expect(furthest(before)).toBeLessThanOrEqual(NODE_NUDGE);
        expect(countNodeOverlaps(test.diagram)).toBe(0);
      });

      it('moves only the picked nodes', async () => {
        const before = places();
        await actions.randomize('Randomize 1 node', 1, (all) => [all[4]], { move: true });
        test.settle();
        const moved = nodesOf(test.diagram).filter(
          (part) => !part.location.equalsApprox(before.get(part.key as number)!),
        );
        expect(moved.map((part) => part.key)).toEqual([test.model.nodeDataArray[4].key]);
      });

      it('is put back exactly by undo, and done again exactly by redo', async () => {
        const before = places();
        await actions.randomize('Randomize all nodes', 1, (all) => all, { move: true });
        test.settle();
        const after = places();

        await actions.undo();
        test.settle();
        expect(furthest(before)).toBe(0);
        expect(test.history.describeState().ok).toBe(true);

        await actions.redo();
        test.settle();
        expect(furthest(after)).toBe(0);
      });

      it('starts from the new place of a node that was put elsewhere in the meantime', async () => {
        await actions.randomize('Randomize all nodes', 1, (all) => all, { move: true });
        const part = test.diagram.findNodeForKey(3)!;
        test.diagram.commit(() => {
          part.location = new go.Point(part.location.x + 500, part.location.y + 300);
        }, 'drag');
        test.settle();
        const dropped = part.location.copy();

        await actions.randomize('5 × randomize all nodes', 5, (all) => all, { move: true });
        test.settle();
        expect(Math.abs(part.location.x - dropped.x)).toBeLessThanOrEqual(NODE_NUDGE);
        expect(Math.abs(part.location.y - dropped.y)).toBeLessThanOrEqual(NODE_NUDGE);
      });

      it('switches to another layout instead when asked to, in the same undo step', async () => {
        const before = places();
        expect(test.model.modelData.layoutType).toBe('top-bottom');
        await actions.randomize('Randomize all nodes', 1, (all) => all, { layout: true });
        test.settle();
        const picked = test.model.modelData.layoutType;
        expect(picked).not.toBe('top-bottom');
        expect(LAYOUTS.map((layout) => layout.type)).toContain(picked);
        // Every node has a new place, and not just a little way off.
        expect(furthest(before)).toBeGreaterThan(NODE_NUDGE);
        expect(countNodeOverlaps(test.diagram)).toBe(0);
        expect(test.history.length).toBe(1);
        expect(lastOp()).toMatchObject({ op: 'Randomize all nodes', steps: 1 });

        await actions.undo();
        test.settle();
        expect(test.model.modelData.layoutType).toBe('top-bottom');
        expect(furthest(before)).toBe(0);
        expect(test.history.describeState().ok).toBe(true);
      });

      it('picks a different layout every time', async () => {
        const seen: string[] = [test.model.modelData.layoutType];
        for (let i = 0; i < 6; i++) {
          await actions.randomize('Randomize all nodes', 1, (all) => all, { layout: true });
          seen.push(test.model.modelData.layoutType);
        }
        for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
      });

      it('lets the layout decide where the nodes go when asked for both', async () => {
        await actions.randomize('Randomize all nodes', 1, (all) => all, {
          layout: true,
          move: true,
        });
        test.settle();
        expect(test.model.modelData.layoutType).not.toBe('top-bottom');
        expect(countNodeOverlaps(test.diagram)).toBe(0);
      });

      it('picks only among the quick layouts on a big diagram', async () => {
        const big = createTestDiagram({ count: 500, linkType: 'straight' });
        const bigRunner = big.injector.get(OperationRunner);
        bigRunner.connect(big.diagram, { beforeEach: () => undefined, afterEach: () => undefined });
        bigRunner.busy.set(false);
        const bigActions = big.injector.get(DiagramActions);
        bigActions.connect(big.diagram);
        for (let i = 0; i < 6; i++) {
          await bigActions.randomize('Randomize all nodes', 1, (all) => all, { layout: true });
          expect(QUICK_LAYOUTS).toContain(big.model.modelData.layoutType);
        }
      }, 60_000);

      it('leaves the layout of an empty diagram alone', async () => {
        const empty = createTestDiagram({ nodes: [], links: [] });
        const emptyRunner = empty.injector.get(OperationRunner);
        emptyRunner.connect(empty.diagram, {
          beforeEach: () => undefined,
          afterEach: () => undefined,
        });
        emptyRunner.busy.set(false);
        const emptyActions = empty.injector.get(DiagramActions);
        emptyActions.connect(empty.diagram);
        await emptyActions.randomize('Randomize all nodes', 1, (all) => all, { layout: true });
        expect(empty.model.modelData.layoutType).toBe('top-bottom');
      });

      it('takes the lines along: they still meet their nodes and cross none', async () => {
        await actions.randomize('Randomize all nodes', 1, (all) => all, { move: true });
        test.settle();
        for (const link of linksOf(test.diagram)) {
          const ends = [
            [link.getPoint(0), link.fromNode!.actualBounds],
            [link.getPoint(link.pointsCount - 1), link.toNode!.actualBounds],
          ] as const;
          for (const [point, bounds] of ends) {
            const onSide = [bounds.top, bounds.bottom].some((y) => Math.abs(y - point.y) < 1);
            expect(onSide).toBe(true);
            expect(point.x).toBeGreaterThan(bounds.left);
            expect(point.x).toBeLessThan(bounds.right);
          }
        }
        expect(countLinksOverNodes(test.diagram)).toBeLessThanOrEqual(1);
      });
    });

    it('adds a node with a key that nothing uses, not even a relationship of a deleted node', async () => {
      test.history.record('dangling', () =>
        test.model.addLinkData({ key: 900, from: 1, to: 77, category: 'relation' }),
      );
      await actions.addNode();
      const added = test.model.nodeDataArray.at(-1)!;
      expect(added.key).toBe(78);
      expect(added).toMatchObject({ title: 'New fund 78', shape: 'Rectangle', color: '#f3f4f6' });
      expect(lastOp().op).toBe('Add node');
    });
  });

  describe('styles', () => {
    it('gives every node of the given types a color and a shape, as one undo step', async () => {
      const type = node(5).legalEntityType;
      const count = test.model.nodeDataArray.filter((data) => data.legalEntityType === type).length;
      await actions.applyStyle('legalEntityType', new Set([type]), '#fde68a', 'Diamond');
      for (const data of test.model.nodeDataArray) {
        expect(data.color).toBe(data.legalEntityType === type ? '#fde68a' : '#f3f4f6');
        expect(data.shape).toBe(data.legalEntityType === type ? 'Diamond' : 'Rectangle');
      }
      expect(test.history.length).toBe(1);
      expect(lastOp().op).toBe(`Style ${count} ${count === 1 ? 'node' : 'nodes'}`);
    });

    it('leaves alone what was not picked', async () => {
      await actions.applyStyle(
        'legalEntityType',
        new Set([node(5).legalEntityType]),
        null,
        'Ellipse',
      );
      expect(node(5).shape).toBe('Ellipse');
      expect(node(5).color).toBe('#f3f4f6');
    });

    it('shows a legal entity field on the nodes without styling any of them', async () => {
      const hidden = createTestDiagram({ subtitleField: null });
      const hiddenRunner = hidden.injector.get(OperationRunner);
      hiddenRunner.connect(hidden.diagram, {
        beforeEach: () => undefined,
        afterEach: () => undefined,
      });
      hiddenRunner.busy.set(false);
      const hiddenActions = hidden.injector.get(DiagramActions);
      hiddenActions.connect(hidden.diagram);

      await hiddenActions.applyStyle('legalEntityType', new Set(), null, null);
      expect(hidden.model.modelData.subtitleField).toBe('legalEntityType');
      expect(hidden.history.length).toBe(1);
      expect(hiddenRunner.log()[0].op).toBe('Show legal entity type on nodes');
      for (const data of hidden.model.nodeDataArray) {
        expect(data).toMatchObject({ color: '#f3f4f6', shape: 'Rectangle' });
      }
      // Asking for the field that is already shown changes nothing.
      await hiddenActions.applyStyle('legalEntityType', new Set(), null, null);
      expect(hidden.history.length).toBe(1);

      await hiddenActions.applyStyle(null, new Set(), null, null);
      expect(hidden.model.modelData.subtitleField).toBeNull();
      expect(hiddenRunner.log()[0].op).toBe('Hide subtitle on nodes');
    });

    it('unselects the shown field when the styles are reset, in the same undo step', async () => {
      // The harness shows the legal entity type on the nodes from the start.
      expect(test.model.modelData.subtitleField).toBe('legalEntityType');
      await actions.applyStyle(
        'legalEntityType',
        new Set([node(5).legalEntityType]),
        '#fde68a',
        null,
      );
      await actions.resetStyles();
      expect(test.model.modelData.subtitleField).toBeNull();
      expect(node(5).color).toBe('#f3f4f6');
      expect(test.history.length).toBe(2);

      await actions.undo();
      expect(test.model.modelData.subtitleField).toBe('legalEntityType');
      expect(node(5).color).toBe('#fde68a');
    });

    it('shows the field and styles nodes in the same undo step', async () => {
      const hidden = createTestDiagram({ subtitleField: null });
      const hiddenRunner = hidden.injector.get(OperationRunner);
      hiddenRunner.connect(hidden.diagram, {
        beforeEach: () => undefined,
        afterEach: () => undefined,
      });
      hiddenRunner.busy.set(false);
      const hiddenActions = hidden.injector.get(DiagramActions);
      hiddenActions.connect(hidden.diagram);
      const type = hidden.model.nodeDataArray[4].legalEntityType;

      await hiddenActions.applyStyle('legalEntityType', new Set([type]), '#fde68a', null);
      expect(hidden.model.modelData.subtitleField).toBe('legalEntityType');
      expect(hidden.model.nodeDataArray[4].color).toBe('#fde68a');
      expect(hidden.history.length).toBe(1);

      await hiddenActions.undo();
      expect(hidden.model.modelData.subtitleField).toBeNull();
      expect(hidden.model.nodeDataArray[4].color).toBe('#f3f4f6');
    });

    it('turns every node back into a gray rectangle, and does nothing when there is nothing to reset', async () => {
      // First take the field off the nodes, so that only styles are left to reset.
      await actions.applyStyle(null, new Set(), null, null);
      const listed = runner.log().length;
      await actions.resetStyles();
      expect(runner.log()).toHaveLength(listed);
      await actions.applyStyle(
        'legalEntityType',
        new Set([node(5).legalEntityType]),
        '#fde68a',
        'Diamond',
      );
      await actions.resetStyles();
      for (const data of test.model.nodeDataArray) {
        expect(data.color).toBe('#f3f4f6');
        expect(data.shape).toBe('Rectangle');
      }
      expect(lastOp().op).toBe('Reset styles');
    });
  });

  describe('deleting', () => {
    it('removes the nodes and the relationships attached to them, and nothing else', async () => {
      const attached = test.model.linkDataArray.filter((link) => link.from === 2 || link.to === 2);
      const links = test.model.linkDataArray.length;
      await actions.deleteNodes([2], []);
      expect(test.model.findNodeDataForKey(2)).toBeNull();
      expect(test.model.nodeDataArray).toHaveLength(29);
      expect(test.model.linkDataArray).toHaveLength(links - attached.length);
      expect(lastOp().op).toBe('Delete 1 node');

      await actions.undo();
      expect(test.model.nodeDataArray).toHaveLength(30);
      expect(test.model.linkDataArray).toHaveLength(links);
    });

    it('removes the given relationships with the nodes', async () => {
      const extra = test.model.linkDataArray.find((link) => link.from !== 2 && link.to !== 2)!;
      await actions.deleteNodes([2], [extra]);
      expect(test.model.containsLinkData(extra)).toBe(false);
    });

    it('does nothing for nodes that are no longer there', async () => {
      await actions.deleteNodes([999], []);
      expect(test.history.length).toBe(0);
      expect(runner.log()).toEqual([]);
    });

    it('removes relationships and leaves their nodes', async () => {
      const [first, second] = test.model.linkDataArray;
      await actions.removeLinks(() => [first, second]);
      expect(test.model.containsLinkData(first)).toBe(false);
      expect(test.model.containsLinkData(second)).toBe(false);
      expect(test.model.nodeDataArray).toHaveLength(30);
      expect(lastOp().op).toBe('Remove 2 relationships');
    });
  });

  describe('the diagram as a whole', () => {
    it('switches the layout, moving the nodes, as one undo step', async () => {
      const before = places();
      await actions.changeLayout('grid');
      test.settle();
      expect(test.model.modelData.layoutType).toBe('grid');
      expect(places()).not.toEqual(before);
      expect(lastOp().op).toBe('Layout: Grid');
      await actions.undo();
      test.settle();
      expect(test.model.modelData.layoutType).toBe('top-bottom');
      expect(places()).toEqual(before);
    });

    it('does nothing when asked for the layout or the line type that is in use', async () => {
      await actions.changeLayout('top-bottom');
      await actions.changeLinkType('avoid');
      expect(test.history.length).toBe(0);
    });

    it('arranges moved nodes again', async () => {
      const before = places();
      test.history.record('move', () => {
        const part = test.diagram.findNodeForKey(5)!;
        part.location = part.location.copy().offset(900, 500);
      });
      await actions.autoArrange();
      test.settle();
      expect(places()).toEqual(before);
      expect(lastOp().op).toBe('Auto arrange');
    });

    it('switches the line type', async () => {
      await actions.changeLinkType('straight');
      expect(test.model.modelData.linkType).toBe('straight');
      expect(lastOp().op).toBe('Lines: Straight (crosses nodes)');
    });

    it('shows and hides the cards of all relationships, with and without room for them', async () => {
      const compact = test.diagram.documentBounds.copy();
      await actions.showCards(true);
      test.settle();
      expect(allLinkCardsShown(test.diagram)).toBe(true);
      expect(
        test.diagram.documentBounds.width * test.diagram.documentBounds.height,
      ).toBeGreaterThan(compact.width * compact.height * 1.5);
      expect(lastOp().op).toBe('Expand all');
      // Asking again changes nothing.
      await actions.showCards(true);
      expect(test.history.length).toBe(1);

      await actions.showCards(false);
      test.settle();
      expect(allLinkCardsShown(test.diagram)).toBe(false);
      expect(lastOp().op).toBe('Collapse all');
    });

    it('renames and describes the diagram', async () => {
      await actions.setDiagramInfo('name', 'Meridian holdings');
      await actions.setDiagramInfo('description', 'As of the third quarter');
      expect(test.model.modelData).toMatchObject({
        name: 'Meridian holdings',
        description: 'As of the third quarter',
      });
      expect(runner.log().map((entry) => entry.op)).toEqual(['Describe diagram', 'Rename diagram']);
      await actions.setDiagramInfo('name', 'Meridian holdings');
      expect(test.history.length).toBe(2);
    });
  });

  describe('zooming', () => {
    it('zooms in, out and to the whole diagram without recording or timing anything', () => {
      test.diagram.scale = 1;
      actions.zoomIn();
      expect(test.diagram.scale).toBeGreaterThan(1);
      const zoomedIn = test.diagram.scale;
      actions.zoomOut();
      expect(test.diagram.scale).toBeLessThan(zoomedIn);

      test.diagram.scale = 3;
      actions.zoomToFit();
      test.settle();
      expect(test.diagram.scale).toBeLessThan(3);
      const view = test.diagram.viewportBounds;
      for (const node of nodesOf(test.diagram)) {
        expect(view.containsRect(node.actualBounds)).toBe(true);
      }

      expect(test.history.length).toBe(0);
      expect(runner.log()).toEqual([]);
    });
  });

  describe('moving through the history', () => {
    beforeEach(async () => {
      await actions.setField(() => [node(1)], 'color', '#1e3a8a');
      await actions.setField(() => [node(2)], 'color', '#fde68a');
      await actions.setField(() => [node(3)], 'color', '#a7f3d0');
    });

    it('undoes and redoes one step at a time', async () => {
      await actions.undo();
      expect(node(3).color).toBe('#f3f4f6');
      expect(lastOp()).toMatchObject({ op: 'Undo', steps: 1 });
      await actions.redo();
      expect(node(3).color).toBe('#a7f3d0');
      expect(lastOp()).toMatchObject({ op: 'Redo', steps: 1 });
    });

    it('undoes everything back to the start and redoes it to the newest state', async () => {
      await actions.undoAll();
      expect(lastOp()).toMatchObject({ op: 'Undo all', steps: 3 });
      expect(test.history.describeState()).toEqual({
        label: 'Initial state: matches the startup snapshot',
        ok: true,
      });
      await actions.redoAll();
      expect(lastOp()).toMatchObject({ op: 'Redo all', steps: 3 });
      expect(test.history.describeState()).toEqual({
        label: 'Latest state: matches the snapshot taken before undo',
        ok: true,
      });
    });

    it('lists nothing when there is nothing to undo or redo', async () => {
      const listed = runner.log().length;
      await actions.redo();
      await actions.redoAll();
      await actions.undoAll();
      await actions.undo();
      await actions.undoAll();
      expect(runner.log()).toHaveLength(listed + 1);
    });
  });
});
