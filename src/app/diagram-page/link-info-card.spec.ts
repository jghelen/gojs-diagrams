import * as go from 'gojs/release/go';
import { TestDiagram, createTestDiagram } from '../../testing/diagram-harness';
import { LinkData, formatOwnership } from '../diagram/node-data';
import { LinkInfoCard } from './link-info-card';

describe('LinkInfoCard', () => {
  let test: TestDiagram;
  let card: LinkInfoCard;

  const links = () => test.model.linkDataArray;
  const iconOf = (link: LinkData) =>
    test.diagram.transformDocToView(test.diagram.findLinkForData(link)!.midPoint);

  beforeEach(() => {
    test = createTestDiagram();
    card = test.injector.get(LinkInfoCard);
    card.connect(test.diagram);
  });

  it('is closed at first', () => {
    expect(card.info()).toBeNull();
  });

  it('shows the two funds of a relationship and its ownership', () => {
    const link = links().find((candidate) => candidate.ownership !== undefined)!;
    card.show(link);
    const info = card.info()!;
    expect(info.link).toBe(link);
    expect(info.from).toBe(test.model.findNodeDataForKey(link.from));
    expect(info.to).toBe(test.model.findNodeDataForKey(link.to));
    expect(info.ownership).toBe(formatOwnership(link.ownership!));
  });

  it('has no ownership to show where there is no data', () => {
    card.show(links().find((candidate) => candidate.ownership === undefined)!);
    expect(card.info()!.ownership).toBeNull();
  });

  it('stands beside the info icon, inside the canvas, for every relationship', () => {
    // The canvas is 1000 by 700 here; the card is 270 by 178.
    for (const link of links()) {
      card.show(link);
      const { left, top } = card.info()!;
      expect(left).toBeGreaterThanOrEqual(8);
      expect(left + 270).toBeLessThanOrEqual(1000 - 8);
      expect(top).toBeGreaterThanOrEqual(8);
      expect(top + 178).toBeLessThanOrEqual(700 - 8);
      const icon = iconOf(link);
      const beside =
        Math.abs(left - (icon.x + 14)) <= 1 || Math.abs(left + 270 - (icon.x - 14)) <= 1;
      const atTheEdge = left === 8 || left + 270 === 1000 - 8;
      expect(beside || atTheEdge).toBe(true);
    }
  });

  it('goes to the left of its icon where there is no room on the right', () => {
    const rightmost = [...links()].sort((a, b) => iconOf(b).x - iconOf(a).x)[0];
    test.diagram.scale = 1;
    const icon = test.diagram.findLinkForData(rightmost)!.midPoint;
    // Put the icon near the right edge of the canvas.
    test.diagram.position = new go.Point(icon.x - 950, icon.y - 350);
    test.settle();
    card.show(rightmost);
    expect(card.info()!.left + 270).toBeLessThanOrEqual(iconOf(rightmost).x);
  });

  it('is put away by a second call for the same relationship, and moves for another', () => {
    const [first, second] = links();
    card.show(first);
    card.show(second);
    expect(card.info()!.link).toBe(second);
    card.show(second);
    expect(card.info()).toBeNull();
  });

  it('follows its icon when the diagram is scrolled', () => {
    test.diagram.scale = 1;
    const middle = test.diagram.documentBounds.center;
    const link = [...links()].sort((a, b) => {
      const distance = (candidate: LinkData) =>
        test.diagram.findLinkForData(candidate)!.midPoint.distanceSquaredPoint(middle);
      return distance(a) - distance(b);
    })[0];
    const icon = test.diagram.findLinkForData(link)!.midPoint;
    test.diagram.centerRect(new go.Rect(icon.x, icon.y, 1, 1));
    test.settle();
    card.show(link);
    const before = { ...card.info()! };
    const from = test.diagram.position.copy();
    test.diagram.position = new go.Point(from.x + 60, from.y + 40);
    test.settle();
    card.follow();
    const moved = { x: test.diagram.position.x - from.x, y: test.diagram.position.y - from.y };
    expect(card.info()!.left).toBeCloseTo(before.left - moved.x, 0);
    expect(card.info()!.top).toBeCloseTo(before.top - moved.y, 0);
  });

  it('keeps the same card while nothing moved', () => {
    card.show(links()[0]);
    const info = card.info();
    card.follow();
    expect(card.info()).toBe(info);
  });

  it('is put away when its relationship is removed', () => {
    const link = links()[0];
    card.show(link);
    test.history.record('remove', () => test.model.removeLinkData(link));
    card.follow();
    expect(card.info()).toBeNull();
  });

  it('is not opened for a relationship that is not in the diagram', () => {
    card.show({ key: 9999, from: 1, to: 2, category: 'relation' });
    expect(card.info()).toBeNull();
  });

  it('can be closed, and following a closed card does nothing', () => {
    card.show(links()[0]);
    card.close();
    expect(card.info()).toBeNull();
    card.follow();
    expect(card.info()).toBeNull();
  });
});
