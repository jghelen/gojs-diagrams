import { createNodes } from '../diagram/node-data';
import { FundStyles } from './fund-styles';

describe('FundStyles', () => {
  let styles: FundStyles;
  const nodes = createNodes(30);
  const types = () => [...new Set(nodes.map((node) => node.legalEntityType))].sort();

  beforeEach(() => {
    styles = new FundStyles();
    // Opened on a diagram whose nodes already show their legal entity type.
    styles.open(nodes, 'legalEntityType');
  });

  it('opens on the field the nodes show, with nothing ticked or picked', () => {
    expect(styles.field()).toBe('legalEntityType');
    expect(styles.shownField()).toBe('legalEntityType');
    expect(styles.types().size).toBe(0);
    expect(styles.draft()).toEqual({ color: null, shape: null });
    expect(styles.canApply()).toBe(false);

    const fresh = new FundStyles();
    fresh.open(nodes, null);
    expect(fresh.field()).toBeNull();
    expect(fresh.rows()).toEqual([]);
    expect(fresh.nodePreview().subtitle).toBeNull();
  });

  it('can be applied with a field alone, when the nodes do not show that field yet', () => {
    const fresh = new FundStyles();
    fresh.open(nodes, null);
    expect(fresh.canApply()).toBe(false);
    fresh.chooseField('legalEntityType');
    expect(fresh.hasFieldToApply()).toBe(true);
    expect(fresh.hasStyleToApply()).toBe(false);
    expect(fresh.canApply()).toBe(true);
    // Taking the field back leaves nothing to apply.
    fresh.chooseField(null);
    expect(fresh.canApply()).toBe(false);
  });

  it('can be applied to take the field off the nodes again', () => {
    styles.chooseField(null);
    expect(styles.hasFieldToApply()).toBe(true);
    expect(styles.canApply()).toBe(true);
  });

  it('lists nothing until a legal entity field is chosen', () => {
    const fresh = new FundStyles();
    fresh.refresh(nodes);
    expect(fresh.field()).toBeNull();
    expect(fresh.rows()).toEqual([]);
    fresh.chooseField('legalEntityType');
    expect(fresh.field()).toBe('legalEntityType');
    expect(fresh.rows().map((row) => row.type)).toEqual(types());
  });

  it('forgets the list and what was ticked when the field is unselected or unknown', () => {
    styles.toggleType(types()[0]);
    styles.chooseField(null);
    expect(styles.rows()).toEqual([]);
    expect(styles.types().size).toBe(0);
    styles.chooseField('no such field');
    expect(styles.field()).toBeNull();
    expect(styles.rows()).toEqual([]);
  });

  it('lists every legal entity type once, in alphabetical order, with its number of nodes', () => {
    expect(styles.rows().map((row) => row.type)).toEqual(types());
    const counted = styles.rows().reduce((sum, row) => sum + row.count, 0);
    expect(counted).toBe(30);
  });

  it('says which color and shape a type has, or null where its nodes differ', () => {
    const [first] = types();
    const mixed = nodes.map((node) => ({ ...node }));
    mixed.find((node) => node.legalEntityType === first)!.color = '#1e3a8a';
    const several = mixed.filter((node) => node.legalEntityType === first).length > 1;
    styles.refresh(mixed);
    const row = styles.rows().find((candidate) => candidate.type === first)!;
    expect(row.color).toBe(several ? null : '#1e3a8a');
    expect(row.shape).toBe('Rectangle');
  });

  it('ticks and unticks legal entity types, one by one and all at once', () => {
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
    styles.toggleType(types()[0]);
    styles.choose('color', '#fde68a');
    styles.choose('shape', 'Diamond');
    expect(styles.draft()).toEqual({ color: '#fde68a', shape: 'Diamond' });
    styles.choose('color', '#fde68a');
    expect(styles.draft()).toEqual({ color: null, shape: 'Diamond' });
  });

  it('lets a color or a shape be picked only while a value is ticked', () => {
    expect(styles.canPickStyle()).toBe(false);
    styles.choose('color', '#fde68a');
    styles.choose('shape', 'Diamond');
    expect(styles.draft()).toEqual({ color: null, shape: null });

    styles.toggleType(types()[0]);
    expect(styles.canPickStyle()).toBe(true);
    styles.choose('color', '#fde68a');
    expect(styles.draft().color).toBe('#fde68a');
  });

  it('forgets the picked color and shape when the last value is unticked', () => {
    const [first, second] = types();
    styles.toggleType(first);
    styles.toggleType(second);
    styles.choose('shape', 'Capsule');
    styles.toggleType(first);
    expect(styles.draft().shape).toBe('Capsule');
    styles.toggleType(second);
    expect(styles.draft()).toEqual({ color: null, shape: null });
    expect(styles.canPickStyle()).toBe(false);

    styles.selectAllTypes(true);
    styles.choose('color', '#fde68a');
    styles.selectAllTypes(false);
    expect(styles.draft()).toEqual({ color: null, shape: null });
  });

  it('needs a ticked value and a color or a shape to style nodes', () => {
    expect(styles.canApply()).toBe(false);
    styles.toggleType(types()[0]);
    expect(styles.canApply()).toBe(false);
    styles.choose('color', '#fde68a');
    expect(styles.canApply()).toBe(true);
    styles.choose('color', '#fde68a');
    expect(styles.canApply()).toBe(false);
    styles.choose('shape', 'Ellipse');
    expect(styles.canApply()).toBe(true);
  });

  it('previews the node that Apply would make', () => {
    expect(styles.nodePreview()).toMatchObject({ fill: '#f3f4f6', subtitle: 'Legal entity type' });
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
    expect(styles.nodePreview().subtitle).toBe('2 legal entity types');
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

  it('unticks a legal entity type that no node has any more', () => {
    const [first, second] = types();
    styles.toggleType(first);
    styles.toggleType(second);
    styles.refresh(nodes.filter((node) => node.legalEntityType !== first));
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
    // The legal entity field is unselected as well, and with it the list.
    expect(styles.field()).toBeNull();
    expect(styles.rows()).toEqual([]);
  });
});
