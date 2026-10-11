import { TestDiagram, createTestDiagram, linksOf, nodesOf } from '../../testing/diagram-harness';
import { LinkData, NodeData } from '../diagram/node-data';
import { SelectionState } from './selection-state';

describe('SelectionState', () => {
  let test: TestDiagram;
  let selection: SelectionState;

  const node = (key: number) => test.diagram.findNodeForKey(key)!;
  const select = (...keys: number[]) => {
    test.diagram.selectCollection(keys.map(node));
    // What the page does whenever the selection changes.
    selection.highlightSelected();
    selection.sync();
  };
  const dimmed = () => nodesOf(test.diagram).filter((part) => part.opacity < 1).length;

  beforeEach(() => {
    test = createTestDiagram();
    selection = test.injector.get(SelectionState);
    selection.connect(test.diagram);
    selection.sync();
  });

  describe('what is selected', () => {
    it('is nothing at first', () => {
      expect(selection.selected()).toBeNull();
      expect(selection.selectedNodes()).toEqual([]);
      expect(selection.selectedLinkData()).toEqual([]);
      expect(selection.selectedLinks()).toBe(0);
      expect(selection.linksOfSelectedNodes()).toBe(0);
      expect(selection.shapeScope()).toBeNull();
    });

    it('gives the data of the selected nodes', () => {
      select(3, 5, 8);
      expect(
        selection
          .selectedNodes()
          .map((data) => data.key)
          .sort((a, b) => a - b),
      ).toEqual([3, 5, 8]);
      expect(selection.selected()!.count).toBe(3);
    });

    it('says which values the selected nodes share, and null where they differ', () => {
      test.history.record('edit', () => {
        test.model.set(node(3).data as NodeData, 'color', '#1e3a8a');
        test.model.set(node(3).data as NodeData, 'shape', 'Diamond');
      });
      select(3);
      expect(selection.selected()).toMatchObject({
        count: 1,
        title: (node(3).data as NodeData).title,
        color: '#1e3a8a',
        shape: 'Diamond',
      });
      select(3, 4);
      expect(selection.selected()).toMatchObject({
        count: 2,
        title: null,
        color: null,
        shape: null,
      });
    });

    it('counts the selected relationships, and those attached to the selected nodes', () => {
      const [first, second] = linksOf(test.diagram);
      test.diagram.selectCollection([first, second]);
      selection.sync();
      expect(selection.selectedLinks()).toBe(2);
      expect(selection.selectedLinkData()).toEqual([first.data, second.data]);
      expect(selection.selected()).toBeNull();

      select(2);
      const attached = test.model.linkDataArray.filter((link) => link.from === 2 || link.to === 2);
      expect(selection.linksOfSelectedNodes()).toBe(attached.length);
      expect(new Set(selection.linkDataOfSelectedNodes())).toEqual(new Set<LinkData>(attached));
    });

    it('counts a relationship between two selected nodes once', () => {
      const link = test.model.linkDataArray[0];
      select(link.from, link.to);
      const attached = test.model.linkDataArray.filter(
        (candidate) =>
          [link.from, link.to].includes(candidate.from) ||
          [link.from, link.to].includes(candidate.to),
      );
      expect(selection.linksOfSelectedNodes()).toBe(attached.length);
    });
  });

  describe('the highlight', () => {
    it('dims the rest of the diagram while exactly one node is selected', () => {
      select(8);
      expect(dimmed()).toBeGreaterThan(0);
      expect(node(8).opacity).toBe(1);
    });

    it('ends when a second node is selected, and when nothing is', () => {
      select(8);
      select(8, 9);
      expect(dimmed()).toBe(0);
      select(8);
      test.diagram.clearSelection();
      selection.highlightSelected();
      expect(dimmed()).toBe(0);
    });

    it('is not started by a selected relationship', () => {
      test.diagram.select(linksOf(test.diagram)[0]);
      selection.highlightSelected();
      expect(dimmed()).toBe(0);
    });

    it('can be ended while the node stays selected', () => {
      select(8);
      selection.clearHighlight();
      expect(dimmed()).toBe(0);
      expect(selection.selectedNodes().map((data) => data.key)).toEqual([8]);
      // Ending it twice does no harm.
      selection.clearHighlight();
      expect(dimmed()).toBe(0);
    });

    it('is forgotten, without touching the diagram, when other data is loaded', () => {
      select(8);
      selection.forgetHighlight();
      // The parts are still dimmed; they are about to be replaced.
      expect(dimmed()).toBeGreaterThan(0);
      expect(selection.shapeTargets().map((data) => data.key)).toEqual([8]);
    });
  });

  describe('what the Shape tool works on', () => {
    it('is the selected nodes when several are selected', () => {
      select(3, 5);
      expect(
        selection
          .shapeTargets()
          .map((data) => data.key)
          .sort((a, b) => a - b),
      ).toEqual([3, 5]);
      expect(selection.shapeScope()).toEqual({ count: 2, shape: 'Rectangle', highlighted: false });
    });

    it('is every highlighted node when one node is selected', () => {
      select(2);
      const highlighted = nodesOf(test.diagram)
        .filter((part) => part.opacity === 1)
        .map((part) => part.key);
      expect(highlighted.length).toBeGreaterThan(1);
      expect(new Set(selection.shapeTargets().map((data) => data.key))).toEqual(
        new Set(highlighted),
      );
      expect(selection.shapeScope()).toEqual({
        count: highlighted.length,
        shape: 'Rectangle',
        highlighted: true,
      });
    });

    it('says null for the shape where the nodes differ', () => {
      test.history.record('edit', () =>
        test.model.set(node(3).data as NodeData, 'shape', 'Ellipse'),
      );
      select(3, 5);
      expect(selection.shapeScope()).toMatchObject({ count: 2, shape: null });
    });

    it('goes back to the selected node alone when the highlight ends', () => {
      select(2);
      selection.clearHighlight();
      expect(selection.shapeScope()).toEqual({ count: 1, shape: 'Rectangle', highlighted: false });
    });
  });
});
