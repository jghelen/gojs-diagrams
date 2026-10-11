import { createNodes } from '../diagram/node-data';
import { FundStyles } from './fund-styles';

describe('FundStyles', () => {
  let styles: FundStyles;
  const nodes = createNodes(30);
  const types = () => [...new Set(nodes.map((node) => node.subtitle))].sort();

  beforeEach(() => {
    styles = new FundStyles();
    styles.refresh(nodes);
  });

  it('lists every fund type once, in alphabetical order, with its number of nodes', () => {
    expect(styles.rows().map((row) => row.type)).toEqual(types());
    const counted = styles.rows().reduce((sum, row) => sum + row.count, 0);
    expect(counted).toBe(30);
  });

  it('says which color and shape a type has, or null where its nodes differ', () => {
    const [first] = types();
    const mixed = nodes.map((node) => ({ ...node }));
    mixed.find((node) => node.subtitle === first)!.color = '#1e3a8a';
    const several = mixed.filter((node) => node.subtitle === first).length > 1;
    styles.refresh(mixed);
    const row = styles.rows().find((candidate) => candidate.type === first)!;
    expect(row.color).toBe(several ? null : '#1e3a8a');
    expect(row.shape).toBe('Rectangle');
  });

  it('ticks and unticks fund types, one by one and all at once', () => {
    const [first, second] = types();
    styles.toggleType(first);
    styles.toggleType(second);
    expect([...styles.types()].sort()).toEqual([first, second].sort());
    styles.toggleType(first);
    expect([...styles.types()]).toEqual([second]);
    expect(styles.allTypesSelected()).toBe(false);

    styles.selectAllTypes(true);
    expect(styles.allTypesSelected()).toBe(true);
    expect(styles.nodeCount()).toBe(30);
    styles.selectAllTypes(false);
    expect(styles.types().size).toBe(0);
    expect(styles.nodeCount()).toBe(0);
  });

  it('takes a picked color or shape back when it is picked a second time', () => {
    styles.choose('color', '#fde68a');
    styles.choose('shape', 'Diamond');
    expect(styles.draft()).toEqual({ color: '#fde68a', shape: 'Diamond' });
    styles.choose('color', '#fde68a');
    expect(styles.draft()).toEqual({ color: null, shape: 'Diamond' });
  });

  it('can be applied only with a fund type and with a color or a shape', () => {
    expect(styles.canApply()).toBe(false);
    styles.choose('color', '#fde68a');
    expect(styles.canApply()).toBe(false);
    styles.toggleType(types()[0]);
    expect(styles.canApply()).toBe(true);
    styles.choose('color', '#fde68a');
    expect(styles.canApply()).toBe(false);
    styles.choose('shape', 'Ellipse');
    expect(styles.canApply()).toBe(true);
  });

  it('previews the node that Apply would make', () => {
    expect(styles.nodePreview()).toMatchObject({ fill: '#f3f4f6', subtitle: 'Fund type' });
    const textOnLightFill = styles.nodePreview().textColor;
    const [first, second] = types();
    styles.toggleType(first);
    styles.choose('color', '#1e3a8a');
    styles.choose('shape', 'Diamond');
    const preview = styles.nodePreview();
    expect(preview).toMatchObject({ fill: '#1e3a8a', subtitle: first, arrowsLeft: 24 });
    // Light text on the dark fill.
    expect(preview.textColor).not.toBe(textOnLightFill);
    styles.toggleType(second);
    expect(styles.nodePreview().subtitle).toBe('2 fund types');
  });

  it('shows the picked style in the row of a ticked type only', () => {
    const [first, second] = types();
    styles.toggleType(first);
    styles.choose('color', '#fde68a');
    const row = (type: string) => styles.rows().find((candidate) => candidate.type === type)!;
    expect(styles.previewOf(row(first)).fill).toBe('#fde68a');
    expect(styles.previewOf(row(second)).fill).toBe('#f3f4f6');
    expect(styles.previewOf(row(first)).mixed).toBe(false);
  });

  it('unticks a fund type that no node has any more', () => {
    const [first, second] = types();
    styles.toggleType(first);
    styles.toggleType(second);
    styles.refresh(nodes.filter((node) => node.subtitle !== first));
    expect([...styles.types()]).toEqual([second]);
  });

  it('forgets the picked style, or everything', () => {
    styles.toggleType(types()[0]);
    styles.choose('shape', 'Capsule');
    styles.clearDraft();
    expect(styles.draft()).toEqual({ color: null, shape: null });
    expect(styles.types().size).toBe(1);
    styles.choose('shape', 'Capsule');
    styles.clearAll();
    expect(styles.draft()).toEqual({ color: null, shape: null });
    expect(styles.types().size).toBe(0);
  });
});
