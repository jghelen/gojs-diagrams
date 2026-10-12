import type { Pool } from 'pg';
import type { Diagram } from './diagram.ts';
import {
  toDiagram,
  type DiagramRow,
  type FieldValueRow,
  type LinkRow,
  type NodeRow,
} from './to-diagram.ts';

const DIAGRAM = `
  select id, version, name, description, layout_type, link_type, cards_expanded,
         subtitle_field, subtitle_user_defined_field_id
  from diagram
  where id = $1`;

// The name and the type come from the legal entity, which is the same in every
// diagram; the rest is how the entity looks in this one.
const NODES = `
  select n.legal_entity_id, e.name, t.name as legal_entity_type,
         n.shape, n.color, n.x, n.y, n.comment
  from diagram_node n
  join legal_entity e on e.id = n.legal_entity_id
  join legal_entity_type t on t.id = e.legal_entity_type_id
  where n.diagram_id = $1
  order by n.legal_entity_id`;

// The lines of a diagram are of two kinds. A relationship of two legal entities
// is the same everywhere, so it is drawn in every diagram that has both of them:
// nothing says per diagram whether it is shown. An artificial link belongs to
// this diagram alone; it has no kind and no percentage. The two take their ids
// from one counter, so an id is the key of one line only.
const LINKS = `
  select r.id, r.from_legal_entity_id, r.to_legal_entity_id,
         r.kind, r.ownership_percent::float8 as ownership_percent
  from relationship r
  join diagram_node f on f.diagram_id = $1 and f.legal_entity_id = r.from_legal_entity_id
  join diagram_node t on t.diagram_id = $1 and t.legal_entity_id = r.to_legal_entity_id
  union all
  select a.id, a.from_legal_entity_id, a.to_legal_entity_id, null, null
  from diagram_artificial_link a
  where a.diagram_id = $1
  order by id`;

// The date is read as text: as a JavaScript date it would get a time and a time
// zone, and could come out a day early.
const FIELD_VALUES = `
  select v.legal_entity_id, f.id as field_id, f.name as field_name, f.data_type, f.is_optional,
         v.value_text, v.value_number::float8 as value_number,
         v.value_date::text as value_date, v.value_boolean
  from diagram_node n
  join legal_entity_field_value v on v.legal_entity_id = n.legal_entity_id
  join user_defined_field f on f.id = v.user_defined_field_id
  where n.diagram_id = $1
  order by v.legal_entity_id, lower(f.name), f.id`;

/**
 * Reads one diagram with its nodes and lines. Gives null when there is no
 * diagram with this id.
 */
export async function readDiagram(pool: Pool, id: number): Promise<Diagram | null> {
  const client = await pool.connect();
  try {
    // Four queries that have to see the same moment: without this, a save that
    // lands between two of them could give nodes of one version and lines of the next.
    await client.query('begin transaction isolation level repeatable read read only');
    try {
      const diagram = (await client.query<DiagramRow>(DIAGRAM, [id])).rows[0];
      if (!diagram) return null;
      const nodes = (await client.query<NodeRow>(NODES, [id])).rows;
      const links = (await client.query<LinkRow>(LINKS, [id])).rows;
      const fieldValues = (await client.query<FieldValueRow>(FIELD_VALUES, [id])).rows;
      return toDiagram(diagram, nodes, links, fieldValues);
    } finally {
      await client.query('rollback');
    }
  } finally {
    client.release();
  }
}
