import type {
  Diagram,
  DiagramLink,
  DiagramNode,
  FieldDataType,
  LayoutType,
  LinkType,
  NodeField,
} from './diagram.ts';

// The rows as read-diagram.ts selects them: one row of `diagram`, and the nodes,
// lines and field values that belong to it.

export interface DiagramRow {
  id: number;
  version: number;
  name: string;
  description: string;
  layout_type: LayoutType;
  link_type: LinkType;
  cards_expanded: boolean;
  subtitle_field: 'legalEntityType' | null;
  subtitle_user_defined_field_id: number | null;
}

export interface NodeRow {
  legal_entity_id: number;
  name: string;
  legal_entity_type: string;
  shape: string;
  color: string;
  x: number | null;
  y: number | null;
  comment: string;
}

export interface LinkRow {
  id: number;
  from_legal_entity_id: number;
  to_legal_entity_id: number;
  /** Null for an artificial link, which is not a relationship. */
  kind: 'hierarchy' | 'relation' | null;
  ownership_percent: number | null;
}

export interface FieldValueRow {
  legal_entity_id: number;
  field_id: number;
  field_name: string;
  data_type: FieldDataType;
  is_optional: boolean;
  value_text: string | null;
  value_number: number | null;
  /** As "2019-03-01". */
  value_date: string | null;
  value_boolean: boolean | null;
}

/** Puts the rows of one diagram together into the diagram the API hands out. */
export function toDiagram(
  diagram: DiagramRow,
  nodes: readonly NodeRow[],
  links: readonly LinkRow[],
  fieldValues: readonly FieldValueRow[],
): Diagram {
  const fieldsOf = new Map<number, NodeField[]>();
  for (const row of fieldValues) {
    const fields = fieldsOf.get(row.legal_entity_id) ?? [];
    fields.push(toField(row));
    fieldsOf.set(row.legal_entity_id, fields);
  }
  return {
    id: diagram.id,
    version: diagram.version,
    settings: {
      name: diagram.name,
      description: diagram.description,
      layoutType: diagram.layout_type,
      linkType: diagram.link_type,
      cardsExpanded: diagram.cards_expanded,
      subtitleField: diagram.subtitle_field,
      subtitleUserDefinedFieldId: diagram.subtitle_user_defined_field_id,
    },
    nodes: nodes.map((row) => toNode(row, fieldsOf.get(row.legal_entity_id) ?? [])),
    links: links.map(toLink),
  };
}

function toNode(row: NodeRow, fields: NodeField[]): DiagramNode {
  return {
    key: row.legal_entity_id,
    title: row.name,
    legalEntityType: row.legal_entity_type,
    shape: row.shape,
    color: row.color,
    comment: row.comment,
    // A node without a position is one the layout still has to place.
    ...(row.x !== null && row.y !== null ? { loc: `${row.x} ${row.y}` } : {}),
    fields,
  };
}

function toLink(row: LinkRow): DiagramLink {
  return {
    key: row.id,
    from: row.from_legal_entity_id,
    to: row.to_legal_entity_id,
    category: row.kind ?? 'manual',
    ...(row.ownership_percent !== null ? { ownership: row.ownership_percent } : {}),
  };
}

function toField(row: FieldValueRow): NodeField {
  const values = {
    text: row.value_text,
    number: row.value_number,
    date: row.value_date,
    boolean: row.value_boolean,
  };
  return {
    id: row.field_id,
    name: row.field_name,
    dataType: row.data_type,
    isOptional: row.is_optional,
    value: values[row.data_type],
  };
}
