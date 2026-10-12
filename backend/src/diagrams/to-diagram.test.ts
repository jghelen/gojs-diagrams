import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  toDiagram,
  type DiagramRow,
  type FieldValueRow,
  type LinkRow,
  type NodeRow,
} from './to-diagram.ts';

const DIAGRAM: DiagramRow = {
  id: 7,
  version: 3,
  name: 'Meridian holdings',
  description: 'As of March',
  layout_type: 'layered',
  link_type: 'curved',
  cards_expanded: true,
  subtitle_field: 'legalEntityType',
  subtitle_user_defined_field_id: null,
};

const NODE: NodeRow = {
  legal_entity_id: 1,
  name: 'Meridian Global FoF',
  legal_entity_type: 'Fund of funds',
  shape: 'Ellipse',
  color: '#bfdbfe',
  x: 700.5,
  y: 0,
  comment: 'Annual audit is due on 31 March.',
};

const NO_VALUE = { value_text: null, value_number: null, value_date: null, value_boolean: null };

function field(of: Partial<FieldValueRow>): FieldValueRow {
  return {
    legal_entity_id: 1,
    field_id: 1,
    field_name: 'Jurisdiction',
    data_type: 'text',
    is_optional: true,
    ...NO_VALUE,
    ...of,
  };
}

describe('toDiagram', () => {
  it('gives the settings the names the app uses', () => {
    const diagram = toDiagram(DIAGRAM, [], [], []);

    assert.deepEqual(diagram, {
      id: 7,
      version: 3,
      settings: {
        name: 'Meridian holdings',
        description: 'As of March',
        layoutType: 'layered',
        linkType: 'curved',
        cardsExpanded: true,
        subtitleField: 'legalEntityType',
        subtitleUserDefinedFieldId: null,
      },
      nodes: [],
      links: [],
    });
  });

  it('makes a node of a legal entity and its place in the diagram', () => {
    const [node] = toDiagram(DIAGRAM, [NODE], [], []).nodes;

    assert.deepEqual(node, {
      key: 1,
      title: 'Meridian Global FoF',
      legalEntityType: 'Fund of funds',
      shape: 'Ellipse',
      color: '#bfdbfe',
      comment: 'Annual audit is due on 31 March.',
      loc: '700.5 0',
      fields: [],
    });
  });

  it('keeps every digit of a position', () => {
    const placed = { ...NODE, x: 840.4155888772582, y: -240.75846260198898 };

    const [node] = toDiagram(DIAGRAM, [placed], [], []).nodes;

    assert.equal(node.loc, '840.4155888772582 -240.75846260198898');
  });

  it('leaves the position out for a node that has not been placed yet', () => {
    const [node] = toDiagram(DIAGRAM, [{ ...NODE, x: null, y: null }], [], []).nodes;

    assert.equal('loc' in node, false);
  });

  it('makes a line of a relationship, with its kind and percentage', () => {
    const rows: LinkRow[] = [
      {
        id: 5,
        from_legal_entity_id: 1,
        to_legal_entity_id: 2,
        kind: 'hierarchy',
        ownership_percent: 62.5,
      },
      {
        id: 6,
        from_legal_entity_id: 3,
        to_legal_entity_id: 2,
        kind: 'relation',
        ownership_percent: 12,
      },
    ];

    assert.deepEqual(toDiagram(DIAGRAM, [], rows, []).links, [
      { key: 5, from: 1, to: 2, category: 'hierarchy', ownership: 62.5 },
      { key: 6, from: 3, to: 2, category: 'relation', ownership: 12 },
    ]);
  });

  it('leaves the percentage out when it is not known', () => {
    const row: LinkRow = {
      id: 5,
      from_legal_entity_id: 1,
      to_legal_entity_id: 2,
      kind: 'hierarchy',
      ownership_percent: null,
    };

    assert.deepEqual(toDiagram(DIAGRAM, [], [row], []).links, [
      { key: 5, from: 1, to: 2, category: 'hierarchy' },
    ]);
  });

  it('gives an artificial link the category of a line drawn by hand', () => {
    const row: LinkRow = {
      id: 9,
      from_legal_entity_id: 4,
      to_legal_entity_id: 1,
      kind: null,
      ownership_percent: null,
    };

    assert.deepEqual(toDiagram(DIAGRAM, [], [row], []).links, [
      { key: 9, from: 4, to: 1, category: 'manual' },
    ]);
  });

  it('gives a node the user-defined fields of its legal entity, each with a value of its type', () => {
    const values = [
      field({
        field_id: 1,
        field_name: 'Jurisdiction',
        is_optional: false,
        value_text: 'Luxembourg',
      }),
      field({
        field_id: 2,
        field_name: 'Inception date',
        data_type: 'date',
        value_date: '2019-03-01',
      }),
      field({ field_id: 3, field_name: 'Assets', data_type: 'number', value_number: 1250.5 }),
      field({ field_id: 4, field_name: 'Regulated', data_type: 'boolean', value_boolean: false }),
    ];

    const [node] = toDiagram(DIAGRAM, [NODE], [], values).nodes;

    assert.deepEqual(node.fields, [
      { id: 1, name: 'Jurisdiction', dataType: 'text', isOptional: false, value: 'Luxembourg' },
      { id: 2, name: 'Inception date', dataType: 'date', isOptional: true, value: '2019-03-01' },
      { id: 3, name: 'Assets', dataType: 'number', isOptional: true, value: 1250.5 },
      { id: 4, name: 'Regulated', dataType: 'boolean', isOptional: true, value: false },
    ]);
  });

  it('tells a field that is empty from a field the entity does not have', () => {
    const other = { ...NODE, legal_entity_id: 2 };
    const values = [field({ legal_entity_id: 1, data_type: 'date', field_name: 'Inception date' })];

    const [withField, without] = toDiagram(DIAGRAM, [NODE, other], [], values).nodes;

    assert.deepEqual(withField.fields, [
      { id: 1, name: 'Inception date', dataType: 'date', isOptional: true, value: null },
    ]);
    assert.deepEqual(without.fields, []);
  });
});
