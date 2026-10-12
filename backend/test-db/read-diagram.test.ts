// Reads diagrams from a real PostgreSQL server. Run with `npm run test:db`.
//
// The tests make a database of their own, with the tables of backend/db and the
// sample diagram, and drop it when they are done. They need a server and a user
// that may create databases: the same settings as the backend itself (.env).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { createPool } from '../src/database.ts';
import { readDiagram } from '../src/diagrams/read-diagram.ts';

const database = `fund_diagrams_test_${process.pid}`;
const sqlFiles = ['001_schema.sql', '002_seed.sql', '003_sample_diagram.sql'];

describe('readDiagram, from a database', () => {
  let pool: pg.Pool;

  /** Runs one statement in the server's own database, where databases are made and dropped. */
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
    for (const file of sqlFiles) {
      await pool.query(await readFile(new URL(`../db/${file}`, import.meta.url), 'utf8'));
    }
  });

  after(async () => {
    await pool?.end();
    await inServer(`drop database if exists ${database}`);
  });

  it('reads the sample diagram: its settings, 24 nodes and 26 lines', async () => {
    const diagram = await readDiagram(pool, 1);

    assert.ok(diagram);
    assert.equal(diagram.id, 1);
    assert.equal(diagram.version, 1);
    assert.deepEqual(diagram.settings, {
      name: 'Sample fund structure',
      description: '',
      layoutType: 'top-bottom',
      linkType: 'avoid',
      cardsExpanded: false,
      subtitleField: null,
      subtitleUserDefinedFieldId: null,
    });
    assert.equal(diagram.nodes.length, 24);
    assert.equal(diagram.links.length, 26);
    assert.deepEqual(
      diagram.nodes.map((node) => node.key),
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
  });

  it('reads a node with the name and type of its legal entity and its own look', async () => {
    const diagram = await readDiagram(pool, 1);

    const { fields, ...top } = diagram!.nodes[0];
    assert.deepEqual(top, {
      key: 1,
      title: 'Meridian Global FoF',
      legalEntityType: 'Fund of funds',
      shape: 'Rectangle',
      color: '#f3f4f6',
      comment: 'Annual audit is due on 31 March.',
      loc: '700.5 0',
    });
    assert.ok(fields.length > 0);
  });

  it('reads the kinds of the lines, and a percentage as a number', async () => {
    const { links } = (await readDiagram(pool, 1))!;
    const { rows } = await pool.query(
      `select id, kind, ownership_percent::text as percent from relationship order by id`,
    );

    assert.deepEqual(
      links.map((link) => [link.key, link.category, link.ownership]),
      rows.map((row) => [row.id, row.kind, row.percent === null ? undefined : Number(row.percent)]),
    );
    assert.equal(links.filter((link) => link.category === 'hierarchy').length, 23);
    assert.ok(links.some((link) => typeof link.ownership === 'number'));
  });

  it('reads the user-defined fields of each legal entity, with values of their types', async () => {
    const { nodes } = (await readDiagram(pool, 1))!;
    const values = nodes.flatMap((node) => node.fields);

    for (const dataType of ['text', 'number', 'date', 'boolean'] as const) {
      const expected = { text: 'string', number: 'number', date: 'string', boolean: 'boolean' };
      const filled = values.filter((field) => field.dataType === dataType && field.value !== null);
      assert.ok(filled.length > 0, `a ${dataType} field with a value`);
      for (const field of filled) assert.equal(typeof field.value, expected[dataType]);
    }
    const dates = values.filter((field) => field.dataType === 'date' && field.value !== null);
    for (const date of dates) assert.match(date.value as string, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(
      values.some((field) => field.value === null),
      'a field that is empty',
    );
    assert.ok(
      nodes.some((node) => node.fields.length === 0),
      'an entity without fields',
    );
  });

  it('gives the same legal entity another look in another diagram', async () => {
    await pool.query(`
      insert into diagram (name, layout_type, link_type, cards_expanded, subtitle_field)
        values ('Second diagram', 'grid', 'curved', true, 'legalEntityType');
      insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values
        (2, 1, 'Ellipse', '#bfdbfe', 840.4155888772582, -240.75846260198898, 'Only here'),
        (2, 2, 'Diamond', '#fde68a', null, null, ''),
        (2, 24, 'Rectangle', '#f3f4f6', 0, 300, '');`);

    const second = (await readDiagram(pool, 2))!;
    const first = (await readDiagram(pool, 1))!;

    assert.deepEqual(second.settings, {
      name: 'Second diagram',
      description: '',
      layoutType: 'grid',
      linkType: 'curved',
      cardsExpanded: true,
      subtitleField: 'legalEntityType',
      subtitleUserDefinedFieldId: null,
    });
    const [one, two] = second.nodes;
    assert.equal(one.title, first.nodes[0].title);
    assert.deepEqual(one.fields, first.nodes[0].fields);
    assert.equal(one.shape, 'Ellipse');
    assert.equal(one.color, '#bfdbfe');
    assert.equal(one.comment, 'Only here');
    // Every digit of a position comes back.
    assert.equal(one.loc, '840.4155888772582 -240.75846260198898');
    // Not placed yet.
    assert.equal('loc' in two, false);
    assert.equal(first.nodes[0].shape, 'Rectangle');
  });

  it('draws a relationship in every diagram that has both of its legal entities', async () => {
    const first = (await readDiagram(pool, 1))!;
    const second = (await readDiagram(pool, 2))!;

    // The second diagram has the funds 1, 2 and 24. Of the 26 relationships, only
    // the one between 1 and 2 has both of its ends there, and nobody had to add it.
    const between = (link: { from: number; to: number }) => link.from === 1 && link.to === 2;
    assert.deepEqual(second.links, [first.links.find(between)]);
    assert.equal(second.links[0].category, 'hierarchy');
  });

  it('adds the artificial links of a diagram to that diagram only', async () => {
    await pool.query(`
      insert into diagram_artificial_link (diagram_id, from_legal_entity_id, to_legal_entity_id)
        values (2, 24, 1)`);

    const first = (await readDiagram(pool, 1))!;
    const second = (await readDiagram(pool, 2))!;

    const artificial = second.links.filter((link) => link.category === 'manual');
    assert.equal(artificial.length, 1);
    const [{ key, ...line }] = artificial;
    assert.deepEqual(line, { from: 24, to: 1, category: 'manual' });
    assert.equal(second.links.length, 2);
    // The funds 24 and 1 are in the first diagram too, and get no line there.
    assert.equal(first.links.length, 26);
    assert.ok(first.links.every((link) => link.category !== 'manual'));
    // No line of any diagram has the key of another.
    const keys = [...first.links, ...second.links.filter((link) => link.category === 'manual')];
    assert.equal(new Set(keys.map((link) => link.key)).size, keys.length);
    assert.ok(first.links.every((link) => link.key !== key));
  });

  it('reads a diagram without nodes', async () => {
    const { rows } = await pool.query(`insert into diagram (name) values ('Empty') returning id`);

    const diagram = (await readDiagram(pool, rows[0].id))!;

    assert.equal(diagram.settings.name, 'Empty');
    assert.deepEqual(diagram.nodes, []);
    assert.deepEqual(diagram.links, []);
  });

  it('gives null when there is no diagram with the id', async () => {
    assert.equal(await readDiagram(pool, 999), null);
  });

  it('gives its connection back, also after a diagram that does not exist', async () => {
    for (let i = 0; i < 25; i++) await readDiagram(pool, i % 2 ? 1 : 999);

    assert.equal(pool.waitingCount, 0);
    assert.equal(pool.idleCount, pool.totalCount);
  });
});
