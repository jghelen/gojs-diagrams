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
  highlightTree,
  revealNodesOneByOne,
  textColorFor,
} from './diagram-factory';
import {
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  LinkData,
  NodeData,
  SHAPES,
  formatOwnership,
} from './node-data';

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
      for (const name of ['COLOR', 'COMMENT', 'BATCH', 'DELETE', 'ARROWS', 'LINK_HANDLE']) {
        expect(node.findObject(name)).not.toBeNull();
      }
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
      expect(link.toNode!.actualBounds.intersectsRect(label.actualBounds)).toBe(false);
    }
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

  it('starts from the link handle on the right of a node, for every shape', () => {
    const test = createTestDiagram();
    for (const shape of SHAPES) {
      setAll(test, 'shape', shape);
      const node = test.diagram.findNodeForKey(4)!;
      const handle = node.findObject('LINK_HANDLE')!;
      expect(node.actualBounds.containsRect(handle.getDocumentBounds())).toBe(true);
      expect(handle.getDocumentBounds().centerX).toBeGreaterThan(node.actualBounds.centerX);
      expect(linkStartAt(test, handle.getDocumentBounds().center)).toBe(4);
    }
  });

  it('starts from the very edge of a node as well, but not from its middle', () => {
    const test = createTestDiagram();
    const bounds = test.diagram.findNodeForKey(4)!.actualBounds;
    expect(linkStartAt(test, new go.Point(bounds.centerX, bounds.bottom - 3))).toBe(4);
    // The middle is for moving the node.
    expect(linkStartAt(test, new go.Point(bounds.centerX + 50, bounds.centerY - 30))).toBeNull();
  });
});

describe('highlightTree', () => {
  it('dims everything outside the tree of the given node, and nothing when given null', () => {
    const test = createTestDiagram();
    const node = test.diagram.findNodeForKey(2)!;
    highlightTree(test.diagram, node);

    const tree = node.findTreeParts().addAll(node.findTreeParentChain());
    for (const part of [...nodesOf(test.diagram), ...linksOf(test.diagram)]) {
      expect(part.opacity).toBe(tree.has(part) ? 1 : 0.15);
    }
    expect(test.diagram.findNodeForKey(1)!.opacity).toBe(1);

    highlightTree(test.diagram, null);
    for (const part of [...nodesOf(test.diagram), ...linksOf(test.diagram)])
      expect(part.opacity).toBe(1);
  });

  it('dims the info icon of a dimmed line with it', () => {
    const test = createTestDiagram();
    highlightTree(test.diagram, test.diagram.findNodeForKey(2)!);
    for (const link of linksOf(test.diagram)) {
      expect(link.findAdornment('Info')!.opacity).toBe(link.opacity);
    }
  });

  it('outlines every node of the tree in gold, and no other', () => {
    const test = createTestDiagram();
    const node = test.diagram.findNodeForKey(2)!;
    highlightTree(test.diagram, node);
    test.settle();

    const tree = node.findTreeParts().addAll(node.findTreeParentChain());
    let outlined = 0;
    for (const part of nodesOf(test.diagram)) {
      const outline = part.findAdornment('Focus');
      expect(outline !== null).toBe(tree.has(part));
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
    const tree = node.findTreeParts().addAll(node.findTreeParentChain());
    // A node outside the tree of node 2, joined to it by a drawn link.
    const outsider = nodesOf(test.diagram).find((candidate) => !tree.has(candidate))!;
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

    // Ordinary cross relationships do not pull their nodes into the highlight.
    const stillDimmed = nodesOf(test.diagram).filter((part) => part.opacity < 1);
    expect(stillDimmed.length).toBeGreaterThan(0);
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
