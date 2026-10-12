import type { Pool } from 'pg';
import type { DiagramListPage, DiagramSummary } from './diagram.ts';

/** How many diagrams one page of the list has. */
export const PAGE_SIZE = 20;

/** How long a search text may be. A name is a line of text, not a document. */
export const MAX_SEARCH_LENGTH = 200;

// The search text is looked for anywhere in the name, whatever the capitals.
// It is compared as plain text, not as a pattern: "%" and "_" stand for
// themselves. An empty text leaves every diagram in.
//
// A name may have letters of any alphabet. What the small letter of "Š" is,
// PostgreSQL takes from the language settings the database was created with,
// and with some of them it only knows A to Z. The collation named here knows
// all letters, whatever those settings are (it is part of every usual
// PostgreSQL installation, which comes with the ICU library).
const SMALL = (text: string) => `lower(${text} collate "und-x-icu")`;
const MATCHES = `($1 = '' or strpos(${SMALL('name')}, ${SMALL('$1::text')}) > 0)`;

// The diagram changed last comes first. The id settles the order of diagrams
// changed at the same moment, so that none shows on two pages or on none.
const PAGE = `
  select id, name, created_at, updated_at
  from diagram
  where ${MATCHES}
  order by updated_at desc, id desc
  limit $2 offset $3`;

const TOTAL = `select count(*)::int as total from diagram where ${MATCHES}`;

interface SummaryRow {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Reads one page of the list of diagrams; `page` counts from 1. With a `search`
 * text, the list is of the diagrams that have it in their name, and the totals
 * are of those. A page after the last one has no items, and still says how many
 * diagrams and pages there are.
 */
export async function listDiagrams(
  pool: Pool,
  page: number,
  search = '',
): Promise<DiagramListPage> {
  const client = await pool.connect();
  try {
    // The page and the total have to be of the same moment.
    await client.query('begin transaction isolation level repeatable read read only');
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const { rows } = await client.query<SummaryRow>(PAGE, [search, PAGE_SIZE, offset]);
      const total = (await client.query<{ total: number }>(TOTAL, [search])).rows[0].total;
      return {
        items: rows.map(toSummary),
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      };
    } finally {
      await client.query('rollback');
    }
  } finally {
    client.release();
  }
}

function toSummary(row: SummaryRow): DiagramSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
