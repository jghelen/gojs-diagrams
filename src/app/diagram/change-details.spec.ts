import { createTestDiagram } from '../../testing/diagram-harness';
import { describeChanges } from './change-details';
import { NodeData } from './node-data';
import { MAX_CHANGE_ROWS } from './constants';

describe('describeChanges', () => {
  const lastChanges = (test: ReturnType<typeof createTestDiagram>, limit?: number) =>
    describeChanges([test.model.undoManager.history.last()!], limit);

  it('tells the changes to the data from the changes to the drawing that follow from them', () => {
    const test = createTestDiagram();
    const node = test.model.nodeDataArray[4];
    test.model.commit((m) => {
      m.set(node, 'title', 'New title');
      m.set(node, 'subtitle', 'Hedge fund');
      m.set(node, 'shape', 'Diamond');
      m.set(node, 'color', '#1e3a8a');
    }, 'edit');

    const details = lastChanges(test);
    expect(details.data).toBe(4);
    expect(details.drawing).toBeGreaterThan(4);
    expect(details.total).toBe(details.data + details.drawing);
    expect(details.total).toBe(test.model.undoManager.history.last()!.changes.count);
    expect(details.rows.filter((row) => row.kind === 'data')).toEqual([
      expect.objectContaining({ property: 'title', after: 'New title' }),
      expect.objectContaining({ property: 'fund type', after: 'Hedge fund' }),
      expect.objectContaining({ property: 'shape', before: 'Rectangle', after: 'Diamond' }),
      expect.objectContaining({ property: 'color', before: '#f3f4f6', after: '#1e3a8a' }),
    ]);
  });

  it('names the fund a change belongs to, for data and for drawing alike', () => {
    const test = createTestDiagram();
    const node = test.model.nodeDataArray[4];
    test.model.commit((m) => m.set(node, 'color', '#1e3a8a'), 'edit');
    const subject = `Fund "${node.title}" (node ${node.key})`;
    const details = lastChanges(test);
    expect(details.rows.length).toBeGreaterThan(1);
    for (const row of details.rows) expect(row.subject).toBe(subject);
    // The fill of the shape and the colour of the text follow the data.
    expect(details.rows).toContainEqual(
      expect.objectContaining({ kind: 'drawing', property: 'Shape: fill', after: '#1e3a8a' }),
    );
    expect(details.rows.some((row) => row.property === 'Text: stroke')).toBe(true);
  });

  it('counts the changes per property, data first', () => {
    const test = createTestDiagram();
    test.model.commit((m) => {
      for (const node of m.nodeDataArray) m.set(node, 'color', '#1e3a8a');
    }, 'edit');
    const details = lastChanges(test);
    expect(details.byProperty[0]).toEqual({ kind: 'data', property: 'color', count: 30 });
    expect(details.byProperty).toContainEqual({
      kind: 'drawing',
      property: 'Shape: fill',
      count: 30,
    });
    const counted = details.byProperty.reduce((sum, group) => sum + group.count, 0);
    expect(counted).toBe(details.total);
  });

  it('describes added and removed funds and relationships', () => {
    const test = createTestDiagram();
    test.model.commit(() => {
      const m = test.model;
      m.addNodeData({
        key: 99,
        title: 'Added',
        subtitle: 'Hedge fund',
        shape: 'Rectangle',
        color: '#f3f4f6',
        comment: '',
      });
      m.removeLinkData(m.linkDataArray[0]);
    }, 'edit');
    const details = lastChanges(test);
    expect(details.rows).toContainEqual(
      expect.objectContaining({
        kind: 'data',
        subject: 'Fund "Added" (node 99)',
        property: 'added',
        before: '—',
      }),
    );
    const removed = details.rows.find((row) => row.property === 'removed')!;
    expect(removed.subject).toMatch(/^Relationship \d+ → \d+$/);
    expect(removed.after).toBe('—');
  });

  it('describes a change of the diagram settings', () => {
    const test = createTestDiagram();
    test.model.commit((m) => m.set(m.modelData, 'name', 'Renamed'), 'edit');
    expect(lastChanges(test).rows[0]).toEqual({
      kind: 'data',
      subject: 'Diagram settings',
      property: 'name',
      before: expect.any(String),
      after: 'Renamed',
    });
  });

  it('rounds numbers, and cuts only values of extreme length', () => {
    const test = createTestDiagram();
    const node = test.model.nodeDataArray[0];
    test.model.commit((m) => {
      m.set(node, 'comment', 'x'.repeat(5000));
      m.set(node, 'shape', 'Diamond');
    }, 'edit');
    const details = lastChanges(test);
    for (const row of details.rows) {
      expect(row.before.length).toBeLessThanOrEqual(2000);
      expect(row.after.length).toBeLessThanOrEqual(2000);
      expect(row.after).not.toMatch(/\d\.\d{2,}/);
    }
    expect(details.rows[0].after.length).toBe(2000);
    expect(details.rows[0].after.endsWith('…')).toBe(true);
  });

  it('shows the whole data of a removed relationship and of an added fund', () => {
    const test = createTestDiagram();
    const link = test.model.linkDataArray.find((candidate) => candidate.ownership !== undefined)!;
    const fund: NodeData = {
      key: 99,
      title: 'A fund with a rather long name, to be shown to its end',
      subtitle: 'Fund of funds',
      shape: 'RoundedTopRectangle',
      color: '#f3f4f6',
      comment: 'Added for the test',
    };
    test.model.commit(() => {
      test.model.removeLinkData(link);
      test.model.addNodeData(fund);
    }, 'edit');
    const rows = lastChanges(test).rows;

    const removed = JSON.parse(rows.find((row) => row.property === 'removed')!.before);
    expect(removed).toEqual({
      key: link.key,
      from: link.from,
      to: link.to,
      category: link.category,
      ownership: link.ownership,
    });
    const added = JSON.parse(rows.find((row) => row.property === 'added')!.after);
    expect(added).toMatchObject(fund);
  });

  it('lists only the first changes of a big action, but counts them all', () => {
    const test = createTestDiagram();
    test.model.commit((m) => {
      for (const node of m.nodeDataArray) m.set(node, 'title', `Renamed ${node.key}`);
    }, 'edit');
    const details = lastChanges(test, 10);
    expect(details.rows.length).toBe(10);
    expect(details.total).toBeGreaterThanOrEqual(60);
    expect(MAX_CHANGE_ROWS).toBe(200);
  });

  it('adds up several transactions', () => {
    const test = createTestDiagram();
    const node = test.model.nodeDataArray[0];
    test.model.commit((m) => m.set(node, 'comment', 'one'), 'first');
    test.model.commit((m) => m.set(node, 'comment', 'two'), 'second');
    const history = test.model.undoManager.history;
    const details = describeChanges([history.elt(0), history.elt(1)]);
    expect(details.data).toBe(2);
    const data = details.rows.filter((row) => row.kind === 'data');
    expect(data.map((row) => row.after)).toEqual(['one', 'two']);
    // The red dot on the comment icon appears with the first comment: a change to the drawing.
    expect(details.rows).toContainEqual(
      expect.objectContaining({ kind: 'drawing', before: 'false', after: 'true' }),
    );
  });

  it('is empty for no transactions', () => {
    expect(describeChanges([])).toEqual({
      total: 0,
      data: 0,
      drawing: 0,
      byProperty: [],
      rows: [],
    });
  });
});
