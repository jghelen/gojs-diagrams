import * as go from 'gojs/release/go';
import {
  TestDiagram,
  countNodeOverlaps,
  createTestDiagram,
  linksOf,
  nodesOf,
} from '../../testing/diagram-harness';
import {
  addNodeInView,
  createModel,
  allLinkCardsShown,
  highlightTree,
  highlightedNodes,
  picturedParts,
  refreshLinkCards,
  revealNodesOneByOne,
  showSearchHit,
  textColorFor,
} from './diagram-factory';
import { LinkData, NodeData, formatOwnership } from './node-data';
import { DEFAULT_COLOR, DEFAULT_SHAPE, SHAPES } from './constants';

const NODE_SIZE = { width: 173.5, height: 97.5 };

/** Centre of the icon with this name on the node with this key, in document coordinates. */
function iconCentre(test: TestDiagram, key: number, name: string): go.Point {
  return test.diagram.findNodeForKey(key)!.findObject(name)!.getDocumentBounds().center;
}

function selectedKeys(test: TestDiagram): number[] {
  const keys: number[] = [];
  test.diagram.selection.each((part) => keys.push(part.key as number));
  return keys.sort((a, b) => a - b);
}

function setAll(test: TestDiagram, field: keyof NodeData, value: string): void {
  test.model.commit((m) => {
    for (const node of m.nodeDataArray) m.set(node, field, value);
  }, 'edit');
  test.settle();
}

describe('textColorFor', () => {
  it('uses dark text on light fills and light text on dark fills', () => {
    expect(textColorFor('#f3f4f6')).toBe('#111827');
    expect(textColorFor('#fde68a')).toBe('#111827');
    expect(textColorFor('#1e3a8a')).toBe('#f9fafb');
    expect(textColorFor('#000000')).toBe('#f9fafb');
  });
});

describe('createModel', () => {
  it('keeps layout, line type, name and description in the model, where undo can reach them', () => {
    const settings = {
      layoutType: 'grid',
      linkType: 'straight',
      name: 'My funds',
      description: 'A test',
      cardsExpanded: false,
      subtitleField: null,
    } as const;
    const model = createModel({ nodes: [], links: [] }, settings);
    expect(model.modelData).toEqual(settings);
    expect(model.modelData).not.toBe(settings);
    expect(model.linkKeyProperty).toBe('key');
  });
});

describe('nodes', () => {
  it('are all the same size, whatever their shape', () => {
    const test = createTestDiagram();
    for (const shape of SHAPES) {
      setAll(test, 'shape', shape);
      for (const node of nodesOf(test.diagram)) {
        expect(node.actualBounds.width).toBeCloseTo(NODE_SIZE.width, 1);
        expect(node.actualBounds.height).toBeCloseTo(NODE_SIZE.height, 1);
      }
    }
  });

  it('keep their size when title and subtitle are far too long, and cut the text off', () => {
    const test = createTestDiagram();
    setAll(test, 'title', 'A very long fund name that cannot possibly fit inside a node');
    setAll(test, 'subtitle', 'an equally long fund type that would run out of the node as well');
    const node = test.diagram.findNodeForKey(1)!;
    expect(node.actualBounds.width).toBeCloseTo(NODE_SIZE.width, 1);
    expect(node.actualBounds.height).toBeCloseTo(NODE_SIZE.height, 1);
    expect(countNodeOverlaps(test.diagram)).toBe(0);
  });

  it('cannot have their title or subtitle edited on the node itself', () => {
    const test = createTestDiagram();
    const node = test.diagram.findNodeForKey(1)!;
    const content = node.elt(2) as go.Panel;
    const title = content.elt(0) as go.TextBlock;
    const subtitle = content.elt(1) as go.TextBlock;
    expect(title.editable).toBe(false);
    expect(subtitle.editable).toBe(false);

    // A click on the text of a selected node used to open a text box; so did F2.
    test.diagram.select(node);
    test.clickAt(title.getDocumentBounds().center);
    expect(test.diagram.currentTool).toBe(test.diagram.defaultTool);
    expect(test.diagram.commandHandler.canEditTextBlock()).toBe(false);
    expect(test.diagram.toolManager.textEditingTool.textBlock).toBeNull();
  });

  it('are moved, not edited, when a selected node is dragged by its title', () => {
    const test = createTestDiagram({ layout: 'grid' });
    const node = test.diagram.findNodeForKey(4)!;
    test.diagram.select(node);
    test.settle();
    const title = ((node.elt(2) as go.Panel).elt(0) as go.TextBlock).getDocumentBounds().center;
    const before = node.location.copy();
    const free = test.diagram.documentBounds.width + 400;

    const at = (point: go.Point, change: Partial<go.InputEvent>): go.InputEvent => {
      const event = new go.InputEvent();
      event.diagram = test.diagram;
      event.documentPoint = point.copy();
      event.viewPoint = test.diagram.transformDocToView(point);
      event.button = 0;
      event.buttons = 1;
      return Object.assign(event, change);
    };
    test.diagram.lastInput = at(title, { down: true });
    test.diagram.firstInput = test.diagram.lastInput.copy();
    test.diagram.currentTool.doMouseDown();
    for (const part of [0.3, 1]) {
      test.diagram.lastInput = at(new go.Point(title.x + free * part, title.y), {});
      test.diagram.currentTool.doMouseMove();
    }
    test.diagram.lastInput = at(new go.Point(title.x + free, title.y), { up: true, buttons: 0 });
    test.diagram.currentTool.doMouseUp();
    test.settle();

    expect(node.location.x).toBeCloseTo(before.x + free, 0);
    expect((node.data as NodeData).title).not.toBe('');
    expect(test.diagram.currentTool).toBe(test.diagram.defaultTool);
  });

  it('keep their title and subtitle centred, also when the text is cut off', () => {
    const test = createTestDiagram();
    setAll(test, 'title', 'Silverlake Multi-Strategy Fund 17');
    setAll(test, 'subtitle', 'A fund type with a name that is much too long to fit');
    for (const shape of SHAPES) {
      setAll(test, 'shape', shape);
      const node = test.diagram.findNodeForKey(1)!;
      const content = node.elt(2) as go.Panel;
      for (const text of [content.elt(0) as go.TextBlock, content.elt(1) as go.TextBlock]) {
        expect(text.isOverflowed).toBe(true);
        expect(text.textAlign).toBe('center');
        // The block of text sits in the middle of the node, and the text in the middle of the block.
        expect(text.getDocumentBounds().centerX).toBeCloseTo(node.actualBounds.centerX, 0);
      }
    }
  });

  it('cut a long title in the middle of a word, so that the line is used to its end', () => {
    const test = createTestDiagram();
    const node = test.diagram.findNodeForKey(1)!;
    const title = (node.elt(2) as go.Panel).elt(0) as go.TextBlock;
    expect(title.wrap).toBe(go.Wrap.BreakAll);
    expect(title.maxLines).toBe(1);
    // One short word followed by a very long one: cut between words, only the short word would show.
    setAll(test, 'title', 'Ab Cdefghijklmnopqrstuvwxyzabcdefghijklmnop');
    const cut = (test.diagram.findNodeForKey(1)!.elt(2) as go.Panel).elt(0) as go.TextBlock;
    expect(cut.isOverflowed).toBe(true);
    expect(cut.naturalBounds.width).toBeGreaterThan(cut.maxSize.width * 0.7);
  });

  it('show their subtitle only while the model names a field to show', () => {
    const subtitleOf = (test: TestDiagram, key: number) =>
      (test.diagram.findNodeForKey(key)!.elt(2) as go.Panel).elt(1) as go.TextBlock;

    const hidden = createTestDiagram({ subtitleField: null });
    for (const node of hidden.model.nodeDataArray) {
      expect(subtitleOf(hidden, node.key).visible).toBe(false);
    }
    // The title is still there, and the node keeps its size.
    const title = (hidden.diagram.findNodeForKey(1)!.elt(2) as go.Panel).elt(0) as go.TextBlock;
    expect(title.visible).toBe(true);
    expect(hidden.diagram.findNodeForKey(1)!.actualBounds.width).toBeCloseTo(NODE_SIZE.width, 1);
    expect(hidden.diagram.findNodeForKey(1)!.actualBounds.height).toBeCloseTo(NODE_SIZE.height, 1);

    hidden.history.record('show', () =>
      hidden.model.set(hidden.model.modelData, 'subtitleField', 'legalEntityType'),
    );
    hidden.settle();
    for (const node of hidden.model.nodeDataArray) {
      expect(subtitleOf(hidden, node.key).visible).toBe(true);
      expect(subtitleOf(hidden, node.key).text).toBe(node.subtitle);
    }
    hidden.history.undo();
    hidden.settle();
    expect(subtitleOf(hidden, 1).visible).toBe(false);
  });

  it('have a rule between the text and the icons', () => {
    const { diagram } = createTestDiagram();
    const content = diagram.findNodeForKey(1)!.elt(2) as go.Panel;
    const rule = content.elt(2) as go.Shape;
    expect(rule.figure).toBe('LineH');
    expect(rule.actualBounds.y).toBeGreaterThan(content.elt(1).actualBounds.y);
    expect(rule.actualBounds.y).toBeLessThan(content.elt(3).actualBounds.y);
  });

  it('have a color, a comment, a batch and a delete icon, and two arrows', () => {
    const { diagram } = createTestDiagram();
    for (const node of nodesOf(diagram)) {
      for (const name of ['COLOR', 'COMMENT', 'BATCH', 'DELETE', 'ARROWS']) {
        expect(node.findObject(name)).not.toBeNull();
      }
      // No dot on the right: a relationship is dragged from the edge of the node.
      expect(node.findObject('LINK_HANDLE')).toBeNull();
      expect((node.findObject('ARROWS') as go.Panel).elements.count).toBe(2);
    }
  });

  it('name their icons on hover', () => {
    const { diagram } = createTestDiagram();
    const node = diagram.findNodeForKey(1)!;
    const hoverText = (name: string) => {
      const texts: string[] = [];
      (node.findObject(name)!.toolTip as go.Adornment).elements.each((element) => {
        if (element instanceof go.TextBlock) texts.push(element.text);
      });
      return texts.join('');
    };
    expect(hoverText('COLOR')).toBe('Change color');
    expect(hoverText('COMMENT')).toBe('Add comment');
    expect(hoverText('BATCH')).toBe('Add Batch');
    expect(hoverText('DELETE')).toBe('Delete node');
  });

  it('show the full title and subtitle on hover, only when they were cut off', () => {
    const test = createTestDiagram();
    const texts = () => {
      const content = test.diagram.findNodeForKey(1)!.elt(2) as go.Panel;
      return [content.elt(0) as go.TextBlock, content.elt(1) as go.TextBlock];
    };
    /** What hovering over that text would show: null when the hint stays hidden. */
    const hoverText = (text: go.TextBlock) => {
      const tools = test.diagram.toolManager;
      tools.showToolTip(text.toolTip as go.Adornment, text);
      const tip = tools.currentToolTip as go.Adornment;
      let shown = '';
      tip.elements.each((element) => {
        if (element instanceof go.TextBlock) shown += element.text;
      });
      const visible = tip.visible;
      tools.hideToolTip();
      return visible ? shown : null;
    };

    setAll(test, 'title', 'Short');
    setAll(test, 'subtitle', 'UCITS');
    for (const text of texts()) expect(hoverText(text)).toBeNull();

    const longTitle = 'A very long fund name that cannot possibly fit inside a node';
    const longSubtitle = 'an equally long fund type that would run out of the node as well';
    setAll(test, 'title', longTitle);
    setAll(test, 'subtitle', longSubtitle);
    const [title, subtitle] = texts();
    expect(hoverText(title)).toBe(longTitle);
    expect(hoverText(subtitle)).toBe(longSubtitle);
  });

  it('keep every icon inside the node for every shape', () => {
    const test = createTestDiagram();
    for (const shape of SHAPES) {
      setAll(test, 'shape', shape);
      const node = test.diagram.findNodeForKey(1)!;
      for (const name of ['COLOR', 'COMMENT', 'BATCH', 'DELETE', 'ARROWS']) {
        expect(node.actualBounds.containsRect(node.findObject(name)!.getDocumentBounds())).toBe(
          true,
        );
      }
    }
  });

  it('show a red dot on the comment icon only while there is a comment', () => {
    const test = createTestDiagram();
    const data = test.model.nodeDataArray[0];
    const dot = (test.diagram.findNodeForKey(1)!.findObject('COMMENT') as go.Panel).elt(1);
    expect(dot.visible).toBe(false);

    test.model.commit((m) => m.set(data, 'comment', 'Look at this'), 'comment');
    expect(dot.visible).toBe(true);
    expect((dot as go.Shape).fill).toBe('#dc2626');

    test.model.commit((m) => m.set(data, 'comment', ''), 'comment');
    expect(dot.visible).toBe(false);
  });

  it('are outlined in gold, in their own shape, when selected', () => {
    const test = createTestDiagram();
    setAll(test, 'shape', 'Diamond');
    const node = test.diagram.findNodeForKey(4)!;
    test.diagram.select(node);
    test.settle();
    const outline = node.findAdornment('Selection')!.elt(0) as go.Shape;
    expect(outline.figure).toBe('Diamond');
    expect(outline.fill).toBeNull();
    expect(outline.stroke).toBe('#d4a017');
  });
});

describe('the gold outline', () => {
  const outlineOf = (node: go.Node, category: string) => node.findAdornment(category)!;

  it('fits the node closely for every shape, as it does for a rectangle', () => {
    const test = createTestDiagram();
    const node = test.diagram.findNodeForKey(4)!;
    test.diagram.select(node);
    const sizes: Record<string, go.Rect> = {};
    for (const shape of SHAPES) {
      setAll(test, 'shape', shape);
      test.settle();
      sizes[shape] = outlineOf(node, 'Selection').actualBounds.copy();
    }
    const rectangle = sizes['Rectangle'];
    // Half of the 4px line lies outside the node on each side, and nothing more.
    expect(rectangle.width - node.actualBounds.width).toBeLessThanOrEqual(4.5);
    expect(rectangle.height - node.actualBounds.height).toBeLessThanOrEqual(4.5);
    for (const shape of SHAPES) {
      expect(sizes[shape].width).toBeCloseTo(rectangle.width, 1);
      expect(sizes[shape].height).toBeCloseTo(rectangle.height, 1);
      expect(sizes[shape].center.x).toBeCloseTo(node.actualBounds.center.x, 1);
      expect(sizes[shape].center.y).toBeCloseTo(node.actualBounds.center.y, 1);
    }
  });

  it('fits just as closely around the nodes of a highlighted tree and around a search result', () => {
    const test = createTestDiagram();
    setAll(test, 'shape', 'Ellipse');
    const node = test.diagram.findNodeForKey(4)!;
    highlightTree(test.diagram, node);
    showSearchHit(test.diagram, node);
    test.settle();
    const bounds = node.actualBounds;
    const focus = outlineOf(node, 'Focus').actualBounds;
    expect(focus.width - bounds.width).toBeLessThanOrEqual(4.5);
    expect(focus.height - bounds.height).toBeLessThanOrEqual(4.5);
    // The search outline is 7px wide.
    const search = outlineOf(node, 'Search').actualBounds;
    expect(search.width - bounds.width).toBeLessThanOrEqual(7.5);
    expect(search.height - bounds.height).toBeLessThanOrEqual(7.5);
  });
});

describe('clicks', () => {
  it('report the icon that was clicked and leave the selection alone', () => {
    const test = createTestDiagram();
    test.clickAt(iconCentre(test, 3, 'COLOR'));
    test.clickAt(iconCentre(test, 4, 'COMMENT'));
    test.clickAt(iconCentre(test, 5, 'BATCH'));
    test.clickAt(iconCentre(test, 6, 'DELETE'));
    expect(test.clicks).toEqual([
      { icon: 'onNodeColor', key: 3 },
      { icon: 'onNodeComment', key: 4 },
      { icon: 'onNodeBatch', key: 5 },
      { icon: 'onNodeDelete', key: 6 },
    ]);
    expect(test.diagram.selection.count).toBe(0);
  });

  it('add each clicked node to the selection and take it out again on a second click', () => {
    const test = createTestDiagram();
    const centre = (key: number) =>
      test.diagram.findNodeForKey(key)!.elt(1).getDocumentBounds().center;
    // Away from the text and the icons, which have jobs of their own.
    const body = (key: number) => new go.Point(centre(key).x + 60, centre(key).y - 30);

    test.clickAt(body(3));
    expect(selectedKeys(test)).toEqual([3]);
    test.clickAt(body(7));
    expect(selectedKeys(test)).toEqual([3, 7]);
    test.clickAt(body(3));
    expect(selectedKeys(test)).toEqual([7]);
  });

  it('clear the selection when they land on empty space', () => {
    const test = createTestDiagram();
    test.diagram.selectCollection([
      test.diagram.findNodeForKey(1)!,
      test.diagram.findNodeForKey(2)!,
    ]);
    const bounds = test.diagram.documentBounds;
    test.clickAt(new go.Point(bounds.right + 500, bounds.bottom + 500));
    expect(test.diagram.selection.count).toBe(0);
  });
});

describe('relationship lines', () => {
  it('are all black', () => {
    const { diagram } = createTestDiagram();
    for (const link of linksOf(diagram)) {
      expect((link.findObject('LINE') as go.Shape).stroke).toBe('#000000');
      expect((link.findObject('ARROW') as go.Shape).fill).toBe('#000000');
    }
  });

  it('are solid unless the user drew them, and all have an arrowhead', () => {
    const test = createTestDiagram();
    const tool = test.diagram.toolManager.linkingTool;
    const from = test.diagram.findNodeForKey(2)!;
    const to = test.diagram.findNodeForKey(29)!;
    test.diagram.startTransaction('Linking');
    const drawn = tool.insertLink(from, from.port, to, to.port)!;
    test.diagram.commitTransaction('Linking');
    test.settle();

    expect((drawn.data as LinkData).category).toBe('manual');
    for (const link of linksOf(test.diagram)) {
      const dashed = (link.findObject('LINE') as go.Shape).strokeDashArray !== null;
      expect(dashed).toBe(link === drawn);
      expect(link.findObject('ARROW')).not.toBeNull();
    }
  });

  it('go around the nodes on a small diagram, and keep only their right angles on a big one', () => {
    const small = createTestDiagram({ count: 30, linkType: 'avoid' });
    for (const link of linksOf(small.diagram)) expect(link.routing).toBe(go.Routing.AvoidsNodes);

    const big = createTestDiagram({ count: 500, linkType: 'straight' });
    for (const type of ['avoid', 'orthogonal'] as const) {
      big.model.commit((m) => m.set(m.modelData, 'linkType', type), 'change line type');
      for (const link of linksOf(big.diagram)) {
        expect(link.routing).toBe(go.Routing.Orthogonal);
        expect(link.isOrthogonal).toBe(true);
      }
    }
  });

  it('draw the main holdings thicker than the co-investments, so that the tree stands out', () => {
    const { diagram } = createTestDiagram();
    const width = (kind: string) =>
      (
        linksOf(diagram)
          .find((link) => (link.data as LinkData).category === kind)!
          .findObject('LINE') as go.Shape
      ).strokeWidth;
    expect(width('hierarchy')).toBeGreaterThan(width('relation'));
  });

  it('cross each other plainly, without a hop at the crossing', () => {
    for (const linkType of ['avoid', 'orthogonal', 'straight'] as const) {
      const { diagram } = createTestDiagram({ count: 30, linkType });
      for (const link of linksOf(diagram)) expect(link.curve).toBe(go.Curve.None);
    }
  });

  it('stand out in gold and thicker while the mouse is on them, and are as before afterwards', () => {
    const test = createTestDiagram();
    const link = linksOf(test.diagram)[0];
    const line = link.findObject('LINE') as go.Shape;
    const arrow = link.findObject('ARROW') as go.Shape;
    const width = line.strokeWidth;
    const event = new go.InputEvent();

    link.mouseEnter!(event, link, null);
    expect(line.stroke).toBe('#d4a017');
    expect(arrow.fill).toBe('#d4a017');
    expect(line.strokeWidth).toBeGreaterThan(width);
    // Entering twice does not make it thicker twice.
    link.mouseEnter!(event, link, null);
    expect(line.strokeWidth).toBe(width + 1.5);

    link.mouseLeave!(event, link, null);
    expect(line.stroke).toBe('#000000');
    expect(arrow.fill).toBe('#000000');
    expect(line.strokeWidth).toBe(width);
    // Only the one line the mouse was on had changed.
    for (const other of linksOf(test.diagram)) {
      expect((other.findObject('LINE') as go.Shape).stroke).toBe('#000000');
    }
  });

  it('do not record the hover in the undo history, nor slip it into the next step', () => {
    const test = createTestDiagram();
    const link = linksOf(test.diagram)[0];
    const event = new go.InputEvent();
    link.mouseEnter!(event, link, null);
    link.mouseLeave!(event, link, null);
    expect(test.history.length).toBe(0);

    link.mouseEnter!(event, link, null);
    test.history.record('edit', () => test.model.set(test.model.nodeDataArray[0], 'comment', 'x'));
    const recorded: string[] = [];
    test.model.undoManager.history
      .last()!
      .changes.each((change) => recorded.push(String(change.propertyName)));
    expect(recorded).not.toContain('stroke');
    expect(recorded).not.toContain('strokeWidth');
  });

  it('carry an info icon at their middle, except those the user drew', () => {
    const test = createTestDiagram();
    const from = test.diagram.findNodeForKey(2)!;
    const to = test.diagram.findNodeForKey(29)!;
    test.diagram.startTransaction('Linking');
    const drawn = test.diagram.toolManager.linkingTool.insertLink(from, from.port, to, to.port)!;
    test.diagram.commitTransaction('Linking');
    test.settle();

    for (const link of linksOf(test.diagram)) {
      const icon = link.findAdornment('Info');
      if (link === drawn) {
        expect(icon).toBeNull();
        continue;
      }
      expect(icon).not.toBeNull();
      expect(icon!.location.distanceSquaredPoint(link.midPoint)).toBeLessThan(1);
    }
  });

  it('draw the info icons above the lines and below the nodes', () => {
    const { diagram } = createTestDiagram();
    const layers: string[] = [];
    diagram.layers.each((layer) => layers.push(layer.name));
    const icon = linksOf(diagram)[0].findAdornment('Info')!;
    expect(layers.indexOf(icon.layerName)).toBeGreaterThan(layers.indexOf('Background'));
    expect(layers.indexOf(icon.layerName)).toBeLessThan(layers.indexOf(''));
    expect(linksOf(diagram)[0].layerName).toBe('Background');
  });

  it('report the relationship when its info icon is clicked', () => {
    const test = createTestDiagram();
    const link = linksOf(test.diagram)[5];
    test.clickAt(link.findAdornment('Info')!.location);
    expect(test.clicks).toEqual([{ icon: 'onLinkInfo', key: (link.data as LinkData).key }]);
    expect(test.diagram.selection.count).toBe(0);
  });

  it('show the ownership with two decimals where it is known, and nothing where it is not', () => {
    const { diagram } = createTestDiagram();
    let shown = 0;
    for (const link of linksOf(diagram)) {
      const label = link.findAdornment('Ownership');
      const ownership = (link.data as LinkData).ownership;
      if (ownership === undefined) {
        expect(label).toBeNull();
        continue;
      }
      shown++;
      const text = (label!.findObject('OWNERSHIP') as go.TextBlock).text;
      expect(text).toBe(formatOwnership(ownership));
      expect(text).toMatch(/^\d{1,3}\.\d{2}%$/);
    }
    expect(shown).toBeGreaterThan(0);
  });

  it('write the ownership in dark green, clear of the node the line ends at', () => {
    const { diagram } = createTestDiagram();
    for (const link of linksOf(diagram)) {
      const label = link.findAdornment('Ownership');
      if (!label) continue;
      expect((label.findObject('OWNERSHIP') as go.TextBlock).stroke).toBe('#166534');
      // Nothing behind the figure: no white box over the lines.
      expect((label.elt(0) as go.Shape).fill).toBeNull();
      expect((label.elt(0) as go.Shape).stroke).toBeNull();
      expect(link.toNode!.actualBounds.intersectsRect(label.actualBounds)).toBe(false);
    }
  });

  /** The percentages of the lines that end at each node, per node. */
  const labelsPerNode = (diagram: go.Diagram): go.Rect[][] =>
    nodesOf(diagram).map((node) => {
      const labels: go.Rect[] = [];
      node.findLinksInto().each((link) => {
        const label = link.findAdornment('Ownership');
        if (label) labels.push(label.actualBounds);
      });
      return labels;
    });
  const overlaps = (labels: go.Rect[]): number => {
    let count = 0;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        if (labels[i].intersectsRect(labels[j])) count++;
      }
    }
    return count;
  };

  it('never write one percentage over another when several lines end at the same node', () => {
    for (const layout of ['top-bottom', 'bottom-top', 'grid', 'circle'] as const) {
      for (const linkType of ['avoid', 'straight'] as const) {
        const { diagram } = createTestDiagram({ count: 100, layout, linkType });
        const perNode = labelsPerNode(diagram);
        // The test means something only if nodes do have several percentages.
        expect(perNode.some((labels) => labels.length >= 3)).toBe(true);
        for (const labels of perNode) expect(overlaps(labels)).toBe(0);
      }
    }
  });

  it('keep the percentages apart even when lines run exactly on top of each other', () => {
    const node = (key: number): NodeData => ({
      key,
      title: `Fund ${key}`,
      subtitle: 'Hedge fund',
      shape: 'Rectangle',
      color: '#f3f4f6',
      comment: '',
    });
    const stake = (key: number, ownership: number): LinkData => ({
      key,
      from: 1,
      to: 2,
      category: 'relation',
      ownership,
    });
    // Five lines between the same two funds: the same route, five percentages.
    const test = createTestDiagram({
      nodes: [node(1), node(2)],
      links: [stake(1, 44.65), stake(2, 42.15), stake(3, 81.94), stake(4, 8.5), stake(5, 15.75)],
    });
    const target = test.diagram.findNodeForKey(2)!;
    const [labels] = labelsPerNode(test.diagram).filter((found) => found.length > 0);
    expect(labels.length).toBe(5);
    expect(overlaps(labels)).toBe(0);
    for (const label of labels) expect(target.actualBounds.intersectsRect(label)).toBe(false);
    const texts = linksOf(test.diagram).map(
      (link) => (link.findAdornment('Ownership')!.findObject('OWNERSHIP') as go.TextBlock).text,
    );
    expect(texts.sort()).toEqual(['15.75%', '42.15%', '44.65%', '8.50%', '81.94%'].sort());
  });

  it('keep the percentages apart after a node was moved and after its shape changed', () => {
    const test = createTestDiagram({ count: 100 });
    const busiest = nodesOf(test.diagram)
      .map((node) => ({ node, lines: node.findLinksInto().count }))
      .sort((a, b) => b.lines - a.lines)[0].node;
    test.model.commit((m) => m.set(busiest.data as NodeData, 'shape', 'Ellipse'), 'shape');
    test.settle();
    test.diagram.commit(() => {
      busiest.location = new go.Point(busiest.location.x + 900, busiest.location.y + 300);
    }, 'move');
    test.settle();
    for (const labels of labelsPerNode(test.diagram)) expect(overlaps(labels)).toBe(0);
  });

  it('are drawn right up to the outline of a diamond, an ellipse and a capsule', () => {
    const test = createTestDiagram();
    // How far the line is drawn past its end point; GoJS expresses that as a negative "short length".
    const lengthenedBy = (shortLength: number) => -(shortLength || 0);

    for (const shape of ['Diamond', 'Ellipse', 'Capsule'] as const) {
      setAll(test, 'shape', shape);
      let lengthened = 0;
      for (const link of linksOf(test.diagram)) {
        const from = lengthenedBy(link.fromShortLength);
        const to = lengthenedBy(link.toShortLength);
        expect(from).toBeGreaterThanOrEqual(0);
        expect(to).toBeGreaterThanOrEqual(0);
        // Never further than half the node: the outline is always that near.
        expect(Math.max(from, to)).toBeLessThanOrEqual(NODE_SIZE.width / 2);
        if (from > 0.5 || to > 0.5) lengthened++;
        // The arrowhead moves forward with the end of the line.
        expect((link.findObject('ARROW') as go.Shape).segmentOffset.x).toBeCloseTo(to, 5);
      }
      expect(lengthened).toBeGreaterThan(0);
    }

    setAll(test, 'shape', 'Rectangle');
    for (const link of linksOf(test.diagram)) {
      expect(lengthenedBy(link.fromShortLength)).toBeLessThan(0.5);
      expect(lengthenedBy(link.toShortLength)).toBeLessThan(0.5);
    }
  });

  it('end exactly on the outline of a diamond', () => {
    const test = createTestDiagram();
    setAll(test, 'shape', 'Diamond');
    for (const link of linksOf(test.diagram)) {
      const last = link.pointsCount - 1;
      const ends: [go.Node, go.Point, go.Point, number][] = [
        [link.fromNode!, link.getPoint(0), link.getPoint(1), -(link.fromShortLength || 0)],
        [link.toNode!, link.getPoint(last), link.getPoint(last - 1), -(link.toShortLength || 0)],
      ];
      for (const [node, end, neighbour, extra] of ends) {
        const length = Math.hypot(end.x - neighbour.x, end.y - neighbour.y) || 1;
        const x = end.x + ((end.x - neighbour.x) / length) * extra;
        const y = end.y + ((end.y - neighbour.y) / length) * extra;
        const bounds = node.port.getDocumentBounds();
        // On a diamond, |dx|/a + |dy|/b is exactly 1 on the outline.
        const onOutline =
          Math.abs(x - bounds.centerX) / (bounds.width / 2) +
          Math.abs(y - bounds.centerY) / (bounds.height / 2);
        expect(onOutline).toBeCloseTo(1, 1);
      }
    }
  });
});

describe('relationship cards', () => {
  /** A diagram with the cards of all relationships shown, arranged with room for them. */
  const expanded = (options: Parameters<typeof createTestDiagram>[0] = {}): TestDiagram => {
    const test = createTestDiagram({ ...options, cardsExpanded: true });
    refreshLinkCards(test.diagram);
    test.settle();
    return test;
  };
  /** Switches the cards on or off in the model, where undo can reach it. */
  const setExpanded = (test: TestDiagram, shown: boolean): void => {
    test.history.record(shown ? 'expand all' : 'collapse all', () =>
      test.model.set(test.model.modelData, 'cardsExpanded', shown),
    );
    test.settle();
  };
  const cardOf = (link: go.Link) => link.findAdornment('Card');
  const cardsOf = (test: TestDiagram) =>
    linksOf(test.diagram)
      .map(cardOf)
      .filter((card): card is go.Adornment => card !== null);
  const textOf = (card: go.Adornment, name: string) => (card.findObject(name) as go.TextBlock).text;
  const overlapping = (rects: go.Rect[]): number => {
    let count = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) if (rects[i].intersectsRect(rects[j])) count++;
    }
    return count;
  };
  const onNodes = (test: TestDiagram): number => {
    const nodes = nodesOf(test.diagram).map((node) => node.actualBounds);
    return cardsOf(test).filter((card) =>
      nodes.some((node) => node.intersectsRect(card.actualBounds)),
    ).length;
  };
  const fund = (key: number): NodeData => ({
    key,
    title: `Fund ${key}`,
    subtitle: 'Hedge fund',
    shape: 'Rectangle',
    color: '#f3f4f6',
    comment: '',
  });

  it('are not shown until they are asked for', () => {
    const test = createTestDiagram();
    expect(allLinkCardsShown(test.diagram)).toBe(false);
    expect(cardsOf(test)).toEqual([]);
  });

  it('show, for every relationship from the data, its kind, its two funds and the ownership', () => {
    const test = expanded();
    expect(allLinkCardsShown(test.diagram)).toBe(true);
    for (const link of linksOf(test.diagram)) {
      const data = link.data as LinkData;
      const card = cardOf(link)!;
      expect(card).not.toBeNull();
      expect(textOf(card, 'CARD_TYPE')).toBe(
        data.category === 'hierarchy' ? 'Hierarchy' : 'Relation',
      );
      expect(textOf(card, 'CARD_FROM')).toBe(`From: ${(link.fromNode!.data as NodeData).title}`);
      expect(textOf(card, 'CARD_TO')).toBe(`To: ${(link.toNode!.data as NodeData).title}`);
      expect(textOf(card, 'CARD_OWNERSHIP')).toBe(
        data.ownership === undefined
          ? 'Ownership: no data'
          : `Ownership: ${formatOwnership(data.ownership)}`,
      );
    }
  });

  it('stand where the info icon is, in the middle of the line, when that place is free', () => {
    // Two funds far apart: nothing is in the way of the card.
    const test = expanded({
      nodes: [fund(1), fund(2)],
      links: [{ key: 1, from: 1, to: 2, category: 'hierarchy', ownership: 50 }],
      layout: 'grid',
    });
    test.diagram.commit(() => {
      test.diagram.findNodeForKey(2)!.location = new go.Point(900, 600);
    }, 'move');
    test.settle();
    refreshLinkCards(test.diagram);
    test.settle();
    const link = linksOf(test.diagram)[0];
    const card = cardOf(link)!;
    expect(card.actualBounds.center.x).toBeCloseTo(link.midPoint.x, 0);
    expect(card.actualBounds.center.y).toBeCloseTo(link.midPoint.y, 0);
  });

  it('stand between the nodes: no card covers a node, in any layout', () => {
    for (const layout of [
      'top-bottom',
      'bottom-top',
      'circle',
      'layered',
      'force',
      'grid',
    ] as const) {
      const test = expanded({ layout });
      expect(cardsOf(test)).toHaveLength(test.model.linkDataArray.length);
      expect(onNodes(test)).toBe(0);
    }
  });

  it('never cover one another, in any layout', () => {
    for (const layout of [
      'top-bottom',
      'bottom-top',
      'circle',
      'layered',
      'force',
      'grid',
    ] as const) {
      const test = expanded({ layout });
      expect(overlapping(cardsOf(test).map((card) => card.actualBounds))).toBe(0);
    }
  });

  it('keep clear of nodes and of each other on a bigger diagram too', () => {
    for (const layout of ['top-bottom', 'grid'] as const) {
      const test = expanded({ count: 100, layout });
      expect(onNodes(test)).toBe(0);
      expect(overlapping(cardsOf(test).map((card) => card.actualBounds))).toBe(0);
    }
  });

  it('stay clear of the nodes and of each other on a diagram of 500 funds', () => {
    const test = expanded({ count: 500, linkType: 'straight' });
    expect(cardsOf(test)).toHaveLength(test.model.linkDataArray.length);
    expect(onNodes(test)).toBe(0);
    expect(overlapping(cardsOf(test).map((card) => card.actualBounds))).toBe(0);
  }, 20_000);

  it('are set apart even on lines that run exactly on top of each other', () => {
    const stake = (key: number): LinkData => ({
      key,
      from: 1,
      to: 2,
      category: 'relation',
      ownership: key * 10,
    });
    const test = expanded({
      nodes: [fund(1), fund(2)],
      links: [stake(1), stake(2), stake(3)],
      layout: 'grid',
    });
    const cards = cardsOf(test);
    expect(cards).toHaveLength(3);
    expect(overlapping(cards.map((card) => card.actualBounds))).toBe(0);
    expect(onNodes(test)).toBe(0);
  });

  it('get their room from the layout: the nodes stand further apart while cards are shown', () => {
    const compact = createTestDiagram({ layout: 'grid' });
    const roomy = expanded({ layout: 'grid' });
    const area = (test: TestDiagram) =>
      test.diagram.documentBounds.width * test.diagram.documentBounds.height;
    expect(area(roomy)).toBeGreaterThan(area(compact) * 1.5);
    expect(countNodeOverlaps(roomy.diagram)).toBe(0);
  });

  it('take the place of the info icons, which come back when the cards are put away', () => {
    const test = createTestDiagram();
    const icons = () => linksOf(test.diagram).filter((link) => link.findAdornment('Info')).length;
    expect(icons()).toBe(test.model.linkDataArray.length);

    setExpanded(test, true);
    expect(icons()).toBe(0);
    expect(cardsOf(test)).toHaveLength(test.model.linkDataArray.length);

    setExpanded(test, false);
    expect(icons()).toBe(test.model.linkDataArray.length);
    expect(cardsOf(test)).toEqual([]);
  });

  it('are marked in gold when their line is selected, and not when it is not', () => {
    const test = expanded();
    const [first, second] = linksOf(test.diagram);
    const frame = (link: go.Link) => cardOf(link)!.findObject('CARD_FRAME') as go.Shape;
    expect(frame(first).stroke).toBe('#9ca3af');

    test.diagram.select(first);
    test.settle();
    expect(frame(first).stroke).toBe('#d4a017');
    expect(frame(first).fill).toBe('#fff8e1');
    expect(frame(second).stroke).toBe('#9ca3af');

    // Selecting another line moves the mark; clearing the selection removes it.
    test.diagram.select(second);
    test.settle();
    expect(frame(first).stroke).toBe('#9ca3af');
    expect(frame(first).fill).toBe('#ffffff');
    expect(frame(second).stroke).toBe('#d4a017');
    test.diagram.clearSelection();
    test.settle();
    expect(frame(second).stroke).toBe('#9ca3af');
  });

  it('are in front of the mark of a selected line, which passes behind them', () => {
    const test = expanded();
    const link = linksOf(test.diagram)[0];
    test.diagram.select(link);
    test.settle();
    const layers: go.Layer[] = [];
    test.diagram.layers.each((layer) => layers.push(layer));
    const mark = link.findAdornment('Selection')!;
    expect(mark).not.toBeNull();
    expect(layers.indexOf(cardOf(link)!.layer!)).toBeGreaterThan(layers.indexOf(mark.layer!));
  });

  it('stay where they are when a line is selected', () => {
    const test = expanded();
    const before = cardsOf(test).map((card) => card.location.copy());
    test.diagram.select(linksOf(test.diagram)[5]);
    test.settle();
    test.settle();
    cardsOf(test).forEach((card, i) => expect(card.location.equals(before[i])).toBe(true));
  });

  it('are drawn above the nodes and let clicks through', () => {
    const test = expanded();
    const layers: string[] = [];
    test.diagram.layers.each((layer) => layers.push(layer.name));
    expect(layers.indexOf('LinkCards')).toBeGreaterThan(layers.indexOf(''));
    // And above the layer of selection marks: a selected line passes behind the cards.
    expect(layers.indexOf('LinkCards')).toBeGreaterThan(layers.indexOf('Adornment'));
    for (const card of cardsOf(test)) {
      expect(card.layer!.name).toBe('LinkCards');
      expect(card.pickable).toBe(false);
    }
  });

  it('are not shown for relationships the user drew, which have no info icon either', () => {
    const test = expanded();
    test.model.commit(
      () => test.model.addLinkData({ key: 900, from: 4, to: 9, category: 'manual' }),
      'draw',
    );
    test.settle();
    const drawn = linksOf(test.diagram).find((link) => (link.data as LinkData).key === 900)!;
    expect(cardOf(drawn)).toBeNull();
  });

  it('are given to a relationship that is added while they are shown', () => {
    const test = expanded();
    test.model.commit(
      () => test.model.addLinkData({ key: 901, from: 4, to: 9, category: 'relation' }),
      'add',
    );
    test.settle();
    const added = linksOf(test.diagram).find((link) => (link.data as LinkData).key === 901)!;
    expect(textOf(cardOf(added)!, 'CARD_TYPE')).toBe('Relation');
  });

  it('follow a fund that is renamed', () => {
    const test = expanded();
    const link = linksOf(test.diagram)[0];
    test.model.commit((m) => m.set(link.fromNode!.data as NodeData, 'title', 'Renamed'), 'rename');
    test.settle();
    expect(textOf(cardOf(link)!, 'CARD_FROM')).toBe('From: Renamed');
  });

  it('are switched on and off in the model, so that undo and redo switch them too', () => {
    const test = createTestDiagram();
    setExpanded(test, true);
    expect(cardsOf(test)).toHaveLength(test.model.linkDataArray.length);

    test.history.undo();
    test.settle();
    expect(allLinkCardsShown(test.diagram)).toBe(false);
    expect(cardsOf(test)).toEqual([]);

    test.history.redo();
    test.settle();
    expect(cardsOf(test)).toHaveLength(test.model.linkDataArray.length);

    setExpanded(test, false);
    expect(cardsOf(test)).toEqual([]);
  });

  it('are themselves not recorded: only the switch in the model is', () => {
    const test = createTestDiagram();
    setExpanded(test, true);
    const recorded: string[] = [];
    test.model.undoManager.history
      .last()!
      .changes.each((change) => recorded.push(String(change.propertyName)));
    expect(recorded).toEqual(['cardsExpanded']);
  });

  it('are dimmed with their line when a tree is highlighted, and are part of an exported picture', () => {
    const test = expanded();
    highlightTree(test.diagram, test.diagram.findNodeForKey(2)!);
    test.settle();
    for (const link of linksOf(test.diagram)) expect(cardOf(link)!.opacity).toBe(link.opacity);
    expect(new Set(linksOf(test.diagram).map((link) => link.opacity)).size).toBe(2);

    const pictured = new Set<go.Part>();
    picturedParts(test.diagram).each((part) => pictured.add(part));
    for (const card of cardsOf(test)) expect(pictured.has(card)).toBe(true);
  });
});

describe('revealNodesOneByOne', () => {
  const setHidden = (hidden: boolean) =>
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const visibleNodes = (test: TestDiagram) =>
    nodesOf(test.diagram).filter((node) => node.opacity === 1).length;

  afterEach(() => {
    vi.useRealTimers();
    setHidden(true);
  });

  it('shows the nodes one after another, with the diagram disabled until all are there', () => {
    const test = createTestDiagram();
    setHidden(false);
    vi.useFakeTimers();
    let done = false;

    revealNodesOneByOne(test.diagram, () => (done = true));
    expect(visibleNodes(test)).toBe(0);
    expect(test.diagram.isEnabled).toBe(false);

    vi.advanceTimersByTime(400);
    const partWay = visibleNodes(test);
    expect(partWay).toBeGreaterThan(0);
    expect(partWay).toBeLessThan(30);
    expect(done).toBe(false);

    vi.advanceTimersByTime(3000);
    expect(visibleNodes(test)).toBe(30);
    expect(done).toBe(true);
    expect(test.diagram.isEnabled).toBe(true);
  });

  it('shows a relationship once both of its ends are shown, and ends with everything visible', () => {
    const test = createTestDiagram();
    setHidden(false);
    vi.useFakeTimers();
    revealNodesOneByOne(test.diagram, () => undefined);

    vi.advanceTimersByTime(400);
    for (const link of linksOf(test.diagram)) {
      const bothEnds = link.fromNode!.opacity === 1 && link.toNode!.opacity === 1;
      expect(link.opacity === 1).toBe(bothEnds);
      expect(link.findAdornment('Info')!.opacity).toBe(link.opacity);
    }

    vi.advanceTimersByTime(3000);
    for (const link of linksOf(test.diagram)) expect(link.opacity).toBe(1);
  });

  it('never takes longer than a second and a half, however many nodes there are', () => {
    const test = createTestDiagram({ count: 200, linkType: 'straight' });
    setHidden(false);
    vi.useFakeTimers();
    let done = false;
    revealNodesOneByOne(test.diagram, () => (done = true));
    vi.advanceTimersByTime(1700);
    expect(done).toBe(true);
    expect(visibleNodes(test)).toBe(200);
  });

  it('takes only half a second on a diagram of more than 200 nodes', () => {
    const test = createTestDiagram({ count: 300, linkType: 'straight' });
    setHidden(false);
    vi.useFakeTimers();
    let done = false;
    revealNodesOneByOne(test.diagram, () => (done = true));
    vi.advanceTimersByTime(250);
    expect(visibleNodes(test)).toBeGreaterThan(100);
    expect(visibleNodes(test)).toBeLessThan(300);
    vi.advanceTimersByTime(350);
    expect(done).toBe(true);
    expect(visibleNodes(test)).toBe(300);
  });

  it('is display only: it adds nothing to the undo history', () => {
    const test = createTestDiagram();
    const initial = test.model.toJson();
    setHidden(false);
    vi.useFakeTimers();
    revealNodesOneByOne(test.diagram, () => undefined);
    vi.advanceTimersByTime(3000);
    expect(test.model.undoManager.history.count).toBe(0);
    expect(test.model.toJson()).toBe(initial);
  });

  it('does not slip the switching off and on of the diagram into the next undo step', () => {
    const test = createTestDiagram();
    setHidden(false);
    vi.useFakeTimers();
    revealNodesOneByOne(test.diagram, () => undefined);
    vi.advanceTimersByTime(3000);
    expect(test.diagram.isEnabled).toBe(true);

    // The first thing the user does afterwards, and its undo.
    const node = test.model.nodeDataArray[0];
    test.history.record('edit', () => test.model.set(node, 'title', 'Renamed'));
    const recorded: string[] = [];
    test.model.undoManager.history
      .last()!
      .changes.each((change) => recorded.push(String(change.propertyName)));
    expect(recorded).not.toContain('isEnabled');
    expect(recorded).not.toContain('opacity');

    test.history.undo();
    expect(test.diagram.isEnabled).toBe(true);
    for (const shown of nodesOf(test.diagram)) expect(shown.opacity).toBe(1);
    test.history.redo();
    expect(test.diagram.isEnabled).toBe(true);
  });

  it('skips the animation when the page is hidden, where no frames are drawn', () => {
    const test = createTestDiagram();
    setHidden(true);
    let done = false;
    revealNodesOneByOne(test.diagram, () => (done = true));
    expect(done).toBe(true);
    expect(visibleNodes(test)).toBe(30);
    expect(test.diagram.isEnabled).toBe(true);
  });

  it('skips the animation when the system asks for reduced motion', () => {
    const test = createTestDiagram();
    setHidden(false);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    let done = false;
    revealNodesOneByOne(test.diagram, () => (done = true));
    vi.unstubAllGlobals();
    expect(done).toBe(true);
    expect(visibleNodes(test)).toBe(30);
    expect(test.diagram.isEnabled).toBe(true);
  });

  it('still finishes when the browser draws no frames, as in a background tab', () => {
    const test = createTestDiagram();
    setHidden(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const frames = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    let done = false;
    revealNodesOneByOne(test.diagram, () => (done = true));

    vi.advanceTimersByTime(1000);
    expect(visibleNodes(test)).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(visibleNodes(test)).toBe(30);
    for (const link of linksOf(test.diagram)) expect(link.opacity).toBe(1);
    expect(test.diagram.isEnabled).toBe(true);
    expect(done).toBe(true);
    frames.mockRestore();
  });

  it('can be stopped', () => {
    const test = createTestDiagram();
    setHidden(false);
    vi.useFakeTimers();
    let done = false;
    const stop = revealNodesOneByOne(test.diagram, () => (done = true));
    vi.advanceTimersByTime(200);
    stop();
    const reached = visibleNodes(test);
    vi.advanceTimersByTime(3000);
    expect(visibleNodes(test)).toBe(reached);
    expect(done).toBe(false);
  });
});

describe('drawing a relationship', () => {
  /** Whether a drag that starts at this point would draw a link, and from which node. */
  const linkStartAt = (test: TestDiagram, point: go.Point): number | null => {
    test.diagram.firstInput.documentPoint = point.copy();
    const port = test.diagram.toolManager.linkingTool.findLinkablePort();
    return port ? ((port.part as go.Node).key as number) : null;
  };

  /** A point just inside the right edge of that node, half way up. */
  const edgeOf = (test: TestDiagram, key: number): go.Point => {
    const bounds = test.diagram.findNodeForKey(key)!.actualBounds;
    return new go.Point(bounds.right - 3, bounds.centerY);
  };

  it('starts from the edge of a node, on every side and for every shape', () => {
    const test = createTestDiagram();
    for (const shape of SHAPES) {
      setAll(test, 'shape', shape);
      const bounds = test.diagram.findNodeForKey(4)!.actualBounds;
      expect(linkStartAt(test, new go.Point(bounds.right - 3, bounds.centerY))).toBe(4);
      expect(linkStartAt(test, new go.Point(bounds.left + 3, bounds.centerY))).toBe(4);
      expect(linkStartAt(test, new go.Point(bounds.centerX, bounds.top + 3))).toBe(4);
      expect(linkStartAt(test, new go.Point(bounds.centerX, bounds.bottom - 3))).toBe(4);
    }
  });

  it('does not start from the middle of a node, which is for moving it', () => {
    const test = createTestDiagram();
    const bounds = test.diagram.findNodeForKey(4)!.actualBounds;
    expect(linkStartAt(test, new go.Point(bounds.centerX - 20, bounds.centerY - 30))).toBeNull();
    expect(linkStartAt(test, bounds.center)).toBeNull();
  });

  it('can be caught on the edge or just outside it, however far the diagram is zoomed out', () => {
    const test = createTestDiagram();
    const bounds = test.diagram.findNodeForKey(4)!.actualBounds;
    for (const scale of [1, 0.5, 0.34]) {
      test.diagram.scale = scale;
      // Two pixels on screen inside the right edge, and six pixels outside it.
      expect(linkStartAt(test, new go.Point(bounds.right - 2 / scale, bounds.centerY))).toBe(4);
      expect(linkStartAt(test, new go.Point(bounds.right + 6 / scale, bounds.centerY))).toBe(4);
    }
    // At life size, 30 units is 30 pixels inside the edge: too far, that drag moves the node.
    test.diagram.scale = 1;
    expect(linkStartAt(test, new go.Point(bounds.right - 30, bounds.centerY))).toBeNull();
  });

  it('leaves all of the node but a thin rim for moving it, at every zoom', () => {
    const test = createTestDiagram();
    const bounds = test.diagram.findNodeForKey(4)!.actualBounds;
    for (const scale of [1, 0.5, 0.34, 0.1]) {
      test.diagram.scale = scale;
      // Twelve units inside each edge, and the place of the title.
      for (const point of [
        new go.Point(bounds.left + 12, bounds.centerY),
        new go.Point(bounds.right - 12, bounds.centerY),
        new go.Point(bounds.centerX, bounds.top + 12),
        new go.Point(bounds.centerX, bounds.bottom - 12),
        new go.Point(bounds.centerX, bounds.top + 30),
        bounds.center,
      ]) {
        expect(linkStartAt(test, point)).toBeNull();
      }
    }
  });

  it('never starts from another node than the one under the pointer', () => {
    const test = createTestDiagram({ layout: 'grid' });
    test.diagram.scale = 0.2;
    for (const node of nodesOf(test.diagram)) {
      const bounds = node.actualBounds;
      expect(linkStartAt(test, new go.Point(bounds.left + 4, bounds.centerY))).toBe(node.key);
      expect(linkStartAt(test, new go.Point(bounds.right - 4, bounds.centerY))).toBe(node.key);
    }
  });

  it('starts from the nearer node when the drag begins in the gap between two', () => {
    const test = createTestDiagram({ layout: 'grid' });
    test.diagram.scale = 0.34;
    const [first, second] = nodesOf(test.diagram)
      .filter((node) => Math.abs(node.location.y - nodesOf(test.diagram)[0].location.y) < 1)
      .sort((a, b) => a.location.x - b.location.x);
    const y = first.actualBounds.centerY;
    expect(linkStartAt(test, new go.Point(first.actualBounds.right + 5, y))).toBe(first.key);
    expect(linkStartAt(test, new go.Point(second.actualBounds.left - 5, y))).toBe(second.key);
  });

  /** Presses the mouse at one point of the diagram, moves it to another and lets go. */
  const drag = (test: TestDiagram, from: go.Point, to: go.Point): void => {
    const { diagram } = test;
    const at = (point: go.Point, change: Partial<go.InputEvent>): go.InputEvent => {
      const event = new go.InputEvent();
      event.diagram = diagram;
      event.documentPoint = point.copy();
      event.viewPoint = diagram.transformDocToView(point);
      event.button = 0;
      event.buttons = 1;
      Object.assign(event, change);
      return event;
    };
    diagram.lastInput = at(from, { down: true });
    diagram.firstInput = diagram.lastInput.copy();
    diagram.currentTool.doMouseDown();
    // A few steps on the way, as a hand would make.
    for (const part of [0.2, 0.6, 1]) {
      const point = new go.Point(from.x + (to.x - from.x) * part, from.y + (to.y - from.y) * part);
      diagram.lastInput = at(point, {});
      diagram.currentTool.doMouseMove();
    }
    diagram.lastInput = at(to, { up: true, buttons: 0 });
    diagram.currentTool.doMouseUp();
    test.settle();
  };
  const manualLinks = (test: TestDiagram) =>
    test.model.linkDataArray
      .filter((link) => link.category === 'manual')
      .map((link) => [link.from, link.to]);

  it('is drawn by dragging from the edge of one node to another node', () => {
    const test = createTestDiagram();
    const target = test.diagram.findNodeForKey(9)!.actualBounds.center;
    drag(test, edgeOf(test, 4), target);

    expect(manualLinks(test)).toEqual([[4, 9]]);
    const link = linksOf(test.diagram).find((l) => (l.data as LinkData).category === 'manual')!;
    expect(link.fromNode!.key).toBe(4);
    expect(link.toNode!.key).toBe(9);
    // Dotted, without an info icon, and one undo step.
    expect((link.findObject('LINE') as go.Shape).strokeDashArray).not.toBeNull();
    expect(link.findAdornment('Info')).toBeNull();
    expect(test.model.undoManager.history.count).toBe(1);
    test.model.undoManager.undo();
    expect(manualLinks(test)).toEqual([]);
  });

  it('is drawn the same way when the diagram is zoomed to a third and the edge is only just missed', () => {
    const test = createTestDiagram();
    test.diagram.scale = 0.34;
    const bounds = test.diagram.findNodeForKey(4)!.actualBounds;
    const target = test.diagram.findNodeForKey(9)!.actualBounds.center;
    // Five pixels outside the right edge.
    drag(test, new go.Point(bounds.right + 5 / 0.34, bounds.centerY + 2), target);
    expect(manualLinks(test)).toEqual([[4, 9]]);
  });

  /** Whether any relationship joins these two nodes, in either direction. */
  const linked = (test: TestDiagram, a: number, b: number): boolean =>
    test.model.linkDataArray.some(
      (link) => (link.from === a && link.to === b) || (link.from === b && link.to === a),
    );
  const dragBetween = (test: TestDiagram, from: number, to: number): void =>
    drag(test, edgeOf(test, from), test.diagram.findNodeForKey(to)!.actualBounds.center);

  it('is not drawn a second time between two nodes it already joins, in either direction', () => {
    const test = createTestDiagram();
    expect(linked(test, 4, 9)).toBe(false);
    dragBetween(test, 4, 9);
    expect(manualLinks(test)).toEqual([[4, 9]]);

    dragBetween(test, 4, 9);
    dragBetween(test, 9, 4);
    expect(manualLinks(test)).toEqual([[4, 9]]);
    expect(test.model.undoManager.history.count).toBe(1);
  });

  it('is not drawn between two nodes that the data already links, in either direction', () => {
    const test = createTestDiagram();
    const count = test.model.linkDataArray.length;
    const existing = test.model.linkDataArray.filter((link) => link.category !== 'manual');
    const hierarchy = existing.find((link) => link.category === 'hierarchy')!;
    const relation = existing.find((link) => link.category === 'relation')!;
    for (const link of [hierarchy, relation]) {
      dragBetween(test, link.from, link.to);
      dragBetween(test, link.to, link.from);
    }
    expect(manualLinks(test)).toEqual([]);
    expect(test.model.linkDataArray.length).toBe(count);
    expect(test.model.undoManager.history.count).toBe(0);
  });

  it('can be drawn again once the relationship between the two nodes was removed', () => {
    const test = createTestDiagram();
    dragBetween(test, 4, 9);
    const drawn = test.model.linkDataArray.find((link) => link.category === 'manual')!;
    test.model.commit(() => test.model.removeLinkData(drawn), 'remove');
    test.settle();
    dragBetween(test, 9, 4);
    expect(manualLinks(test)).toEqual([[9, 4]]);
  });

  it('is still drawn from a node that has relationships to other nodes', () => {
    const test = createTestDiagram();
    dragBetween(test, 4, 9);
    // 4 and 9 are both linked now, but not to 12.
    const other = [12, 13, 14, 15].find((key) => !linked(test, 4, key) && !linked(test, 9, key))!;
    dragBetween(test, 4, other);
    dragBetween(test, other, 9);
    expect(manualLinks(test)).toEqual([
      [4, 9],
      [4, other],
      [other, 9],
    ]);
  });

  it('is not drawn by a drag from the middle of a node: that moves the node', () => {
    const test = createTestDiagram({ layout: 'grid' });
    const node = test.diagram.findNodeForKey(4)!;
    const from = new go.Point(node.actualBounds.centerX - 20, node.actualBounds.centerY - 30);
    const before = node.location.copy();
    // Far to the right of everything, where no other node is in the way.
    const free = test.diagram.documentBounds.width + 400;
    drag(test, from, new go.Point(from.x + free, from.y));
    expect(manualLinks(test)).toEqual([]);
    expect(node.location.equals(before)).toBe(false);
  });

  it('moves the node when it is dragged by its title in a diagram that is zoomed to fit', () => {
    const test = createTestDiagram({ layout: 'grid' });
    test.diagram.scale = 0.34;
    const node = test.diagram.findNodeForKey(4)!;
    // Where the title is: 30 units below the top edge.
    const from = new go.Point(node.actualBounds.centerX, node.actualBounds.top + 30);
    const before = node.location.copy();
    const free = test.diagram.documentBounds.width + 400;
    drag(test, from, new go.Point(from.x + free, from.y));

    expect(manualLinks(test)).toEqual([]);
    expect(node.location.x).toBeCloseTo(before.x + free, 0);
    expect(node.location.y).toBeCloseTo(before.y, 0);
    // One undo step, and it puts the node back.
    expect(test.model.undoManager.history.count).toBe(1);
    test.model.undoManager.undo();
    expect(node.location.equals(before)).toBe(true);
  });

  it('moves the node from anywhere but its rim, at the zoom a diagram opens with', () => {
    for (const offset of [
      [0, -30],
      [-60, 0],
      [60, 20],
      [0, 34],
    ]) {
      const test = createTestDiagram({ layout: 'grid' });
      test.diagram.scale = 0.34;
      const node = test.diagram.findNodeForKey(4)!;
      const from = new go.Point(
        node.actualBounds.centerX + offset[0],
        node.actualBounds.centerY + offset[1],
      );
      const before = node.location.copy();
      const free = test.diagram.documentBounds.width + 400;
      drag(test, from, new go.Point(from.x + free, from.y));
      expect(manualLinks(test)).toEqual([]);
      expect(node.location.equals(before)).toBe(false);
    }
  });

  it('is not drawn when the drag ends on empty canvas', () => {
    const test = createTestDiagram();
    const edge = edgeOf(test, 4);
    drag(test, edge, new go.Point(edge.x + 5000, edge.y + 5000));
    expect(manualLinks(test)).toEqual([]);
    expect(test.model.undoManager.history.count).toBe(0);
  });
});

describe('highlightedNodes', () => {
  it('are the nodes shown at full strength by a highlight, and none when nothing is highlighted', () => {
    const test = createTestDiagram();
    expect(highlightedNodes(test.diagram)).toEqual([]);
    const node = test.diagram.findNodeForKey(2)!;
    highlightTree(test.diagram, node);
    const found = highlightedNodes(test.diagram);
    expect(found.length).toBeGreaterThan(1);
    expect(found).toContain(node);
    expect(new Set(found)).toEqual(
      new Set(nodesOf(test.diagram).filter((part) => part.opacity === 1)),
    );
    highlightTree(test.diagram, null);
    expect(highlightedNodes(test.diagram)).toEqual([]);
  });
});

describe('highlightTree', () => {
  /** The tree of a node: the chain above it and everything below it, nodes and hierarchy lines. */
  const treeOf = (node: go.Node) => node.findTreeParts().addAll(node.findTreeParentChain());
  /** What must be highlighted with a node, worked out here independently of the app. */
  const expectedFor = (test: TestDiagram, node: go.Node): Set<go.Part> => {
    const parts = new Set<go.Part>(treeOf(node).toArray());
    // Every line of the node itself, with the node at its other end.
    for (const link of linksOf(test.diagram)) {
      if (link.fromNode !== node && link.toNode !== node) continue;
      parts.add(link);
      parts.add(link.fromNode!);
      parts.add(link.toNode!);
    }
    // Every line between two highlighted nodes.
    for (const link of linksOf(test.diagram)) {
      if (parts.has(link.fromNode!) && parts.has(link.toNode!)) parts.add(link);
    }
    return parts;
  };

  it('dims everything that does not belong to the given node, and nothing when given null', () => {
    const test = createTestDiagram();
    const node = test.diagram.findNodeForKey(2)!;
    highlightTree(test.diagram, node);

    const expected = expectedFor(test, node);
    for (const part of [...nodesOf(test.diagram), ...linksOf(test.diagram)]) {
      expect(part.opacity).toBe(expected.has(part) ? 1 : 0.15);
    }
    expect(test.diagram.findNodeForKey(1)!.opacity).toBe(1);
    expect(nodesOf(test.diagram).some((part) => part.opacity < 1)).toBe(true);

    highlightTree(test.diagram, null);
    for (const part of [...nodesOf(test.diagram), ...linksOf(test.diagram)])
      expect(part.opacity).toBe(1);
  });

  it('highlights the whole tree: the funds above the node and all funds below it', () => {
    const test = createTestDiagram();
    const node = test.diagram.findNodeForKey(2)!;
    highlightTree(test.diagram, node);
    treeOf(node).each((part) => expect(part.opacity).toBe(1));
  });

  it('highlights every relationship line of the node, of any kind, with the node at its other end', () => {
    const test = createTestDiagram();
    for (const key of [2, 5, 8, 13]) {
      const node = test.diagram.findNodeForKey(key)!;
      highlightTree(test.diagram, node);
      const kinds = new Set<string>();
      node.findLinksConnected().each((link) => {
        kinds.add((link.data as LinkData).category);
        expect(link.opacity).toBe(1);
        expect(link.getOtherNode(node)!.opacity).toBe(1);
      });
      // The generated data gives every fund both hierarchy lines and other relationships.
      expect(kinds.has('hierarchy')).toBe(true);
    }
    const withRelations = nodesOf(test.diagram).find((candidate) => {
      let relation = false;
      candidate.findLinksConnected().each((link) => {
        if ((link.data as LinkData).category === 'relation') relation = true;
      });
      return relation;
    })!;
    highlightTree(test.diagram, withRelations);
    withRelations.findLinksConnected().each((link) => {
      if ((link.data as LinkData).category !== 'relation') return;
      expect(link.opacity).toBe(1);
      expect(link.getOtherNode(withRelations)!.findAdornment('Focus')).not.toBeNull();
    });
  });

  it('highlights every line between two highlighted nodes, also one that is not in the tree', () => {
    const test = createTestDiagram();
    let checked = 0;
    for (const node of nodesOf(test.diagram)) {
      highlightTree(test.diagram, node);
      for (const link of linksOf(test.diagram)) {
        const bothShown = link.fromNode!.opacity === 1 && link.toNode!.opacity === 1;
        expect(link.opacity).toBe(bothShown ? 1 : 0.15);
        // A relationship between two funds of the same tree, as in "Cedar Property 13 to Harbor Income 2".
        const cross = (link.data as LinkData).category === 'relation';
        if (cross && bothShown && link.fromNode !== node && link.toNode !== node) checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('dims the info icon of a dimmed line with it', () => {
    const test = createTestDiagram();
    highlightTree(test.diagram, test.diagram.findNodeForKey(2)!);
    for (const link of linksOf(test.diagram)) {
      expect(link.findAdornment('Info')!.opacity).toBe(link.opacity);
    }
  });

  it('outlines every highlighted node in gold, and no other', () => {
    const test = createTestDiagram();
    const node = test.diagram.findNodeForKey(2)!;
    highlightTree(test.diagram, node);
    test.settle();

    const expected = expectedFor(test, node);
    let outlined = 0;
    for (const part of nodesOf(test.diagram)) {
      const outline = part.findAdornment('Focus');
      expect(outline !== null).toBe(expected.has(part));
      if (!outline) continue;
      outlined++;
      expect((outline.elt(0) as go.Shape).stroke).toBe('#d4a017');
      // The outline is drawn around the node it belongs to.
      expect(outline.actualBounds.containsRect(part.actualBounds)).toBe(true);
    }
    expect(outlined).toBeGreaterThan(1);

    highlightTree(test.diagram, null);
    for (const part of nodesOf(test.diagram)) expect(part.findAdornment('Focus')).toBeNull();
  });

  it('includes the nodes joined to the clicked node by a relationship the user drew', () => {
    const test = createTestDiagram();
    const node = test.diagram.findNodeForKey(2)!;
    highlightTree(test.diagram, node);
    // A node that is not highlighted with node 2 yet, then joined to it by a drawn link.
    const outsider = nodesOf(test.diagram).find((candidate) => candidate.opacity < 1)!;
    highlightTree(test.diagram, null);
    test.diagram.startTransaction('Linking');
    const drawn = test.diagram.toolManager.linkingTool.insertLink(
      outsider,
      outsider.port,
      node,
      node.port,
    )!;
    test.diagram.commitTransaction('Linking');
    test.settle();

    highlightTree(test.diagram, node);
    test.settle();
    expect(outsider.opacity).toBe(1);
    expect(outsider.findAdornment('Focus')).not.toBeNull();
    expect(drawn.opacity).toBe(1);
    // The rest of the diagram is still dimmed.
    expect(nodesOf(test.diagram).some((part) => part.opacity < 1)).toBe(true);
  });

  it('is display only: it adds nothing to the undo history', () => {
    const test = createTestDiagram();
    highlightTree(test.diagram, test.diagram.findNodeForKey(2)!);
    highlightTree(test.diagram, null);
    expect(test.model.undoManager.history.count).toBe(0);
  });
});

describe('addNodeInView', () => {
  const newNode = (key: number): NodeData => ({
    key,
    title: `New fund ${key}`,
    subtitle: 'Private equity',
    shape: DEFAULT_SHAPE,
    color: DEFAULT_COLOR,
    comment: '',
  });

  it('puts new nodes where they overlap nothing', () => {
    const test = createTestDiagram();
    for (const key of [31, 32, 33]) {
      test.diagram.commit((d) => addNodeInView(d, newNode(key)), 'add node');
      test.settle();
    }
    expect(test.diagram.nodes.count).toBe(33);
    expect(countNodeOverlaps(test.diagram)).toBe(0);
  });

  it('is one undo step', () => {
    const test = createTestDiagram();
    const initial = test.model.toJson();
    test.diagram.commit((d) => addNodeInView(d, newNode(31)), 'add node');
    expect(test.model.undoManager.history.count).toBe(1);
    test.model.undoManager.undo();
    expect(test.model.toJson()).toBe(initial);
  });
});

describe('dragging', () => {
  it('refuses to put a node on top of another one', () => {
    const { diagram } = createTestDiagram();
    const node = diagram.findNodeForKey(2)!;
    const other = diagram.findNodeForKey(3)!;
    const stay = node.dragComputation!(node, other.location, other.location);
    expect(stay.equals(node.location)).toBe(true);
  });

  it('lets a node go to a free place', () => {
    const { diagram } = createTestDiagram();
    const node = diagram.findNodeForKey(2)!;
    const free = new go.Point(
      diagram.documentBounds.right + 1000,
      diagram.documentBounds.bottom + 1000,
    );
    expect(node.dragComputation!(node, free, free).equals(free)).toBe(true);
  });
});
