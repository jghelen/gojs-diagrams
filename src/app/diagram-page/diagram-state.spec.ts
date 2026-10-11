import { TestDiagram, createTestDiagram } from '../../testing/diagram-harness';
import { DiagramState } from './diagram-state';

describe('DiagramState', () => {
  let test: TestDiagram;
  let state: DiagramState;

  const record = (name: string, change: () => void) => test.history.record(name, change);

  beforeEach(() => {
    test = createTestDiagram({ layout: 'grid', linkType: 'straight' });
    state = test.injector.get(DiagramState);
    state.connect(test.diagram);
  });

  it('knows nothing before it has read the diagram', () => {
    expect(state.stats()).toBeNull();
    expect(state.isEmpty()).toBe(true);
    expect(state.stateCheck()).toEqual({ label: '', ok: null });
  });

  it('reads the numbers of the diagram and of its history', () => {
    state.refresh();
    expect(state.stats()).toMatchObject({
      nodes: 30,
      links: test.model.linkDataArray.length,
      historyLength: 0,
      historyIndex: -1,
      changedEvents: 0,
      canUndo: false,
      canRedo: false,
    });
    expect(state.isEmpty()).toBe(false);
    expect(state.stateCheck()).toEqual({
      label: 'Initial state: matches the startup snapshot',
      ok: true,
    });
  });

  it('reads the settings and the name from the model', () => {
    state.refresh();
    expect(state.layoutType()).toBe('grid');
    expect(state.linkType()).toBe('straight');
    expect(state.name()).toBe('Test diagram');
    expect(state.description()).toBe('');
    expect(state.cardsExpanded()).toBe(false);
  });

  it('follows a change only when asked to read again', () => {
    state.refresh();
    record('rename', () => test.model.set(test.model.modelData, 'name', 'Meridian holdings'));
    expect(state.name()).toBe('Test diagram');
    expect(state.stats()?.historyLength).toBe(0);

    state.refresh();
    expect(state.name()).toBe('Meridian holdings');
    expect(state.stats()).toMatchObject({ historyLength: 1, historyIndex: 0, canUndo: true });
    expect(state.stateCheck().ok).toBeNull();
  });

  it('shows what an undo and a redo put back', () => {
    record('settings', () => {
      test.model.set(test.model.modelData, 'linkType', 'curved');
      test.model.set(test.model.modelData, 'description', 'As of the third quarter');
      test.model.set(test.model.modelData, 'cardsExpanded', true);
    });
    state.refresh();
    expect(state.linkType()).toBe('curved');
    expect(state.description()).toBe('As of the third quarter');
    expect(state.cardsExpanded()).toBe(true);

    test.history.undo();
    state.refresh();
    expect(state.linkType()).toBe('straight');
    expect(state.description()).toBe('');
    expect(state.cardsExpanded()).toBe(false);
    expect(state.stats()).toMatchObject({ canUndo: false, canRedo: true });
    expect(state.stateCheck().ok).toBe(true);

    test.history.redo();
    state.refresh();
    expect(state.linkType()).toBe('curved');
    expect(state.stats()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('says that a diagram without nodes is empty', () => {
    const blank = createTestDiagram({ nodes: [], links: [] });
    const blankState = blank.injector.get(DiagramState);
    blankState.connect(blank.diagram);
    blankState.refresh();
    expect(blankState.stats()).toMatchObject({ nodes: 0, links: 0 });
    expect(blankState.isEmpty()).toBe(true);
  });
});
