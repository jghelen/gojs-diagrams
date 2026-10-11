import { TestDiagram, createTestDiagram } from '../../../testing/diagram-harness';
import { NodeSearch } from './node-search';

describe('NodeSearch', () => {
  let test: TestDiagram;
  let search: NodeSearch;

  /** The first word of a fund's title: its house, which several funds share. */
  const house = () => test.model.nodeDataArray[0].title.split(' ')[0];
  const titled = (query: string) =>
    test.model.nodeDataArray
      .filter((node) => node.title.toLowerCase().includes(query.toLowerCase()))
      .map((node) => node.key);
  const marked = () => {
    const keys: number[] = [];
    test.diagram.nodes.each((node) => {
      if (node.findAdornment('Search')) keys.push(node.key as number);
    });
    return keys;
  };

  beforeEach(() => {
    test = createTestDiagram();
    search = test.injector.get(NodeSearch);
    search.connect(test.diagram);
  });

  it('starts with nothing searched for', () => {
    expect(search.query()).toBe('');
    expect(search.matches()).toEqual([]);
    expect(search.index()).toBe(-1);
    expect(search.summary()).toBe('');
  });

  it('finds the nodes whose name contains what was typed, whatever the case', () => {
    search.search(house().toUpperCase());
    expect(search.matches()).toEqual(titled(house()));
    expect(search.matches().length).toBeGreaterThan(0);
    expect(search.summary()).toBe(`${search.matches().length} found`);
    // Nothing is looked at yet.
    expect(search.index()).toBe(-1);
    expect(marked()).toEqual([]);
  });

  it('says so when nothing is found, and ignores spaces around the text', () => {
    search.search('no fund is called this');
    expect(search.summary()).toBe('No nodes found');
    search.search('   ');
    expect(search.summary()).toBe('');
    expect(search.matches()).toEqual([]);
  });

  it('steps forwards through the results and round to the first again', () => {
    search.search(house());
    const matches = search.matches();
    for (let i = 0; i < matches.length; i++) {
      search.step(1);
      expect(search.index()).toBe(i);
      expect(marked()).toEqual([matches[i]]);
      expect(search.summary()).toBe(`${i + 1} of ${matches.length}`);
    }
    search.step(1);
    expect(search.index()).toBe(0);
  });

  it('steps backwards from the last result', () => {
    search.search(house());
    search.step(-1);
    expect(search.index()).toBe(search.matches().length - 1);
    expect(marked()).toEqual([search.matches().at(-1)]);
  });

  it('does not step when there is nothing to step to', () => {
    search.search('no fund is called this');
    search.step(1);
    expect(search.index()).toBe(-1);
    expect(marked()).toEqual([]);
  });

  it('brings the result into view and shows it at a readable size', () => {
    test.diagram.scale = 0.3;
    search.search(house());
    search.step(1);
    test.settle();
    expect(test.diagram.scale).toBe(1);
    const node = test.diagram.findNodeForKey(search.matches()[0])!;
    expect(test.diagram.viewportBounds.containsRect(node.actualBounds)).toBe(true);
  });

  it('lets go of a result without forgetting the search', () => {
    search.search(house());
    search.step(1);
    search.leaveHit();
    expect(search.index()).toBe(-1);
    expect(marked()).toEqual([]);
    expect(search.matches().length).toBeGreaterThan(0);
    expect(search.summary()).toBe(`${search.matches().length} found`);
  });

  it('follows the diagram: a renamed node leaves the results, and its mark goes', () => {
    search.search(house());
    search.step(1);
    const first = search.matches()[0];
    const before = search.matches().length;
    test.history.record('rename', () =>
      test.model.set(test.model.findNodeDataForKey(first)!, 'title', 'Zzz'),
    );
    search.update();
    expect(search.matches()).toHaveLength(before - 1);
    expect(search.index()).toBe(-1);
    expect(marked()).toEqual([]);
  });

  it('stays on the result that is looked at when other nodes change', () => {
    search.search(house());
    search.step(1);
    search.step(1);
    const lookingAt = search.matches()[search.index()];
    const first = search.matches()[0];
    test.history.record('rename', () =>
      test.model.set(test.model.findNodeDataForKey(first)!, 'title', 'Zzz'),
    );
    search.update();
    expect(search.matches()[search.index()]).toBe(lookingAt);
  });

  it('starts a new search from the beginning', () => {
    search.search(house());
    search.step(1);
    search.search(house().slice(0, 3));
    expect(search.index()).toBe(-1);
    expect(marked()).toEqual([]);
  });

  it('is display only: it adds nothing to the undo history', () => {
    search.search(house());
    search.step(1);
    search.step(1);
    search.leaveHit();
    expect(test.history.length).toBe(0);
  });

  it('can be cleared for a newly loaded diagram', () => {
    search.search(house());
    search.step(1);
    search.clear();
    expect(search.query()).toBe('');
    expect(search.matches()).toEqual([]);
    expect(search.index()).toBe(-1);
    expect(search.summary()).toBe('');
  });
});
