// Reads the list of diagrams from a real PostgreSQL server. Run with `npm run test:db`.
// Like read-diagram.test.ts, it makes a database of its own and drops it afterwards.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { createPool } from '../src/database.ts';
import { listDiagrams, PAGE_SIZE } from '../src/diagrams/list-diagrams.ts';

const database = `fund_diagrams_list_test_${process.pid}`;

describe('listDiagrams, from a database', () => {
  let pool: pg.Pool;

  async function inServer(statement: string): Promise<void> {
    const server = createPool({ ...process.env, PGDATABASE: 'postgres' });
    try {
      await server.query(statement);
    } finally {
      await server.end();
    }
  }

  before(async () => {
    await inServer(`create database ${database}`);
    pool = createPool({ ...process.env, PGDATABASE: database });
    await pool.query(await readFile(new URL('../db/001_schema.sql', import.meta.url), 'utf8'));
  });

  after(async () => {
    await pool?.end();
    await inServer(`drop database if exists ${database}`);
  });

  it('gives an empty first page while there are no diagrams', async () => {
    assert.deepEqual(await listDiagrams(pool, 1), {
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('gives 20 diagrams per page, the one changed last first', async () => {
    // 45 diagrams: number 1 was changed 1 hour ago, number 45 was changed 45 hours ago.
    await pool.query(`
      insert into diagram (name, created_at, updated_at)
      select 'Diagram ' || n, now() - interval '100 days', now() - n * interval '1 hour'
      from generate_series(1, 45) n`);

    const [first, second, third] = await Promise.all([1, 2, 3].map((n) => listDiagrams(pool, n)));

    assert.equal(PAGE_SIZE, 20);
    const names = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, index) => `Diagram ${from + index}`);
    assert.deepEqual(
      first.items.map((item) => item.name),
      names(1, 20),
    );
    assert.deepEqual(
      second.items.map((item) => item.name),
      names(21, 40),
    );
    assert.deepEqual(
      third.items.map((item) => item.name),
      names(41, 45),
    );
    for (const [index, page] of [first, second, third].entries()) {
      const { items, ...rest } = page;
      assert.ok(items.length <= 20);
      assert.deepEqual(rest, { page: index + 1, pageSize: 20, total: 45, totalPages: 3 });
    }
  });

  it('gives the id, the name and the two moments of each diagram', async () => {
    const { rows } = await pool.query(
      `select id, name, created_at, updated_at from diagram where name = 'Diagram 1'`,
    );

    const [item] = (await listDiagrams(pool, 1)).items;

    assert.deepEqual(item, {
      id: rows[0].id,
      name: 'Diagram 1',
      createdAt: rows[0].created_at.toISOString(),
      updatedAt: rows[0].updated_at.toISOString(),
    });
    assert.match(item.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(item.createdAt < item.updatedAt);
  });

  it('puts a diagram that is changed at the top', async () => {
    await pool.query(
      `update diagram set description = 'Looked at again' where name = 'Diagram 33'`,
    );

    const { items } = await listDiagrams(pool, 1);

    assert.equal(items[0].name, 'Diagram 33');
    assert.equal(items[1].name, 'Diagram 1');
  });

  it('shows every diagram exactly once over the pages, also those changed at the same moment', async () => {
    await pool.query(`update diagram set updated_at = '2026-01-01T00:00:00Z'`);

    const pages = await Promise.all([1, 2, 3].map((n) => listDiagrams(pool, n)));
    const ids = pages.flatMap((page) => page.items.map((item) => item.id));

    assert.equal(ids.length, 45);
    assert.equal(new Set(ids).size, 45);
  });

  it('gives no items for a page after the last, and still the totals', async () => {
    assert.deepEqual(await listDiagrams(pool, 4), {
      items: [],
      page: 4,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
  });
});
