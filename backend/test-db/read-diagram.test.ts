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
const sqlFiles = ['001_schema.sql', '002_seed.sql', '003_sample_diagrams.sql'];

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
    // As backend/db/setup.sh creates it.
    await inServer(`create database ${database} encoding 'UTF8' template template0`);
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
      name: 'Sample fund structure LE 24',
      description: '24 funds and 26 relationships',
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
      // The sample funds are the legal entities 1 to 24.
      `select id, kind, ownership_percent::text as percent from relationship
       where from_legal_entity_id <= 24 order by id`,
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

  describe('with a second diagram of some of the same legal entities', () => {
    /** The id of a diagram that shows the sample funds 1, 2 and 24 in its own way. */
    let secondId: number;

    before(async () => {
      const { rows } = await pool.query(`
        insert into diagram (name, layout_type, link_type, cards_expanded, subtitle_field)
        values ('Second diagram', 'grid', 'curved', true, 'legalEntityType')
        returning id`);
      secondId = rows[0].id;
      await pool.query(
        `insert into diagram_node (diagram_id, legal_entity_id, shape, color, x, y, comment) values
           ($1, 1, 'Ellipse', '#bfdbfe', 840.4155888772582, -240.75846260198898, 'Only here'),
           ($1, 2, 'Diamond', '#fde68a', null, null, ''),
           ($1, 24, 'Rectangle', '#f3f4f6', 0, 300, '')`,
        [secondId],
      );
    });

    it('gives the same legal entity another look in another diagram', async () => {
      const second = (await readDiagram(pool, secondId))!;
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
      const second = (await readDiagram(pool, secondId))!;

      // Of the 26 relationships of the sample funds, only the one between 1 and 2
      // has both of its ends in the second diagram, and nobody had to add it there.
      const between = (link: { from: number; to: number }) => link.from === 1 && link.to === 2;
      assert.deepEqual(second.links, [first.links.find(between)]);
      assert.equal(second.links[0].category, 'hierarchy');
    });

    it('adds the artificial links of a diagram to that diagram only', async () => {
      await pool.query(
        `insert into diagram_artificial_link (diagram_id, from_legal_entity_id, to_legal_entity_id)
         values ($1, 24, 1)`,
        [secondId],
      );

      const first = (await readDiagram(pool, 1))!;
      const second = (await readDiagram(pool, secondId))!;

      const artificial = second.links.filter((link) => link.category === 'manual');
      assert.equal(artificial.length, 1);
      const [{ key, ...line }] = artificial;
      assert.deepEqual(line, { from: 24, to: 1, category: 'manual' });
      assert.equal(second.links.length, 2);
      // The funds 24 and 1 are in the first diagram too, and get no line there.
      assert.equal(first.links.length, 26);
      assert.ok(first.links.every((link) => link.category !== 'manual'));
      // No line of any diagram has the key of another.
      assert.ok(first.links.every((link) => link.key !== key));
    });
  });

  describe('the diagrams of the sample file', () => {
    const NAMES = [
      'Sample fund structure LE 24',
      '30 generated funds LE 30',
      '100 generated funds LE 100',
      '200 generated funds LE 200',
      '500 generated funds LE 500',
      '1000 generated funds LE 1000',
      '2000 generated funds LE 2000',
      'Empty diagram LE 0',
    ];

    it("are the eight of the editor's Data dropdown, in that order", async () => {
      const { rows } = await pool.query(`select name from diagram where id <= 8 order by id`);

      assert.deepEqual(
        rows.map((row) => row.name),
        NAMES,
      );
    });

    it('say in their names how many legal entities they have', async () => {
      for (let id = 1; id <= NAMES.length; id++) {
        const diagram = (await readDiagram(pool, id))!;

        assert.equal(diagram.settings.name, NAMES[id - 1]);
        assert.match(diagram.settings.name, new RegExp(` LE ${diagram.nodes.length}$`));
        // Letters, digits and spaces only, as the editor wants a name.
        assert.match(diagram.settings.name, /^[A-Za-z0-9 ]+$/);
      }
    });

    it('have funds of their own, each with its relationships', async () => {
      const lines = [26, 44, 149, 299, 749, 1499, 2999, 0];
      const seen = new Set<number>();
      for (let id = 1; id <= NAMES.length; id++) {
        const diagram = (await readDiagram(pool, id))!;

        assert.equal(diagram.links.length, lines[id - 1], NAMES[id - 1]);
        for (const node of diagram.nodes) {
          assert.equal(seen.has(node.key), false, `fund ${node.key} is in two diagrams`);
          seen.add(node.key);
        }
        const keys = new Set(diagram.nodes.map((node) => node.key));
        assert.ok(diagram.links.every((link) => keys.has(link.from) && keys.has(link.to)));
      }
      assert.equal(seen.size, 3854);
    });

    it('leave the generated funds without a position, for the editor to arrange', async () => {
      const generated = (await readDiagram(pool, 2))!;
      const sample = (await readDiagram(pool, 1))!;

      assert.ok(generated.nodes.every((node) => !('loc' in node)));
      assert.ok(sample.nodes.every((node) => typeof node.loc === 'string'));
    });

    it('read the largest, of 2000 funds, in one go', async () => {
      const diagram = (await readDiagram(pool, 7))!;

      assert.equal(diagram.nodes.length, 2000);
      assert.equal(diagram.links.filter((link) => link.category === 'hierarchy').length, 1999);
    });
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
