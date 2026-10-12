import type { Pool } from 'pg';
import type { DiagramListPage, DiagramSummary } from './diagram.ts';

/** How many diagrams one page of the list has. */
export const PAGE_SIZE = 20;

// The diagram changed last comes first. The id settles the order of diagrams
// changed at the same moment, so that none shows on two pages or on none.
const PAGE = `
  select id, name, created_at, updated_at
  from diagram
  order by updated_at desc, id desc
  limit $1 offset $2`;

const TOTAL = 'select count(*)::int as total from diagram';

interface SummaryRow {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Reads one page of the list of all diagrams; `page` counts from 1. A page
 * after the last one has no items, and still says how many diagrams and pages
 * there are.
 */
export async function listDiagrams(pool: Pool, page: number): Promise<DiagramListPage> {
  const client = await pool.connect();
  try {
    // The page and the total have to be of the same moment.
    await client.query('begin transaction isolation level repeatable read read only');
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const { rows } = await client.query<SummaryRow>(PAGE, [PAGE_SIZE, offset]);
      const total = (await client.query<{ total: number }>(TOTAL)).rows[0].total;
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
