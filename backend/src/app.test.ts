import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { createApp } from './app.ts';
import type { Diagram, DiagramListPage } from './diagrams/diagram.ts';

const DIAGRAM: Diagram = {
  id: 7,
  version: 1,
  settings: {
    name: 'Meridian holdings',
    description: '',
    layoutType: 'top-bottom',
    linkType: 'avoid',
    cardsExpanded: false,
    subtitleField: null,
    subtitleUserDefinedFieldId: null,
  },
  nodes: [
    {
      key: 1,
      title: 'Meridian Global FoF',
      legalEntityType: 'Fund of funds',
      shape: 'Rectangle',
      color: '#f3f4f6',
      comment: '',
      loc: '0 0',
      fields: [],
    },
  ],
  links: [],
};

/** Stands in for the database: knows the diagram 7 and no other. */
const readDiagram = mock.fn(async (id: number): Promise<Diagram | null> =>
  id === 7 ? DIAGRAM : null,
);
/** And a list of 41 diagrams, of which it hands out one per page. */
const listDiagrams = mock.fn(async (page: number): Promise<DiagramListPage> => ({
  items: [
    {
      id: page,
      name: `Diagram ${page}`,
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-12T17:23:58.700Z',
    },
  ],
  page,
  pageSize: 20,
  total: 41,
  totalPages: 3,
}));
let server: Server;
let address: string;

before(async () => {
  // Port 0: whichever port is free.
  server = createApp({ readDiagram, listDiagrams }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  address = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());
beforeEach(() => {
  readDiagram.mock.resetCalls();
  listDiagrams.mock.resetCalls();
});

describe('GET /api/diagrams/:id', () => {
  it('answers with the diagram', async () => {
    const response = await fetch(`${address}/api/diagrams/7`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.deepEqual(await response.json(), DIAGRAM);
    assert.deepEqual(readDiagram.mock.calls[0].arguments, [7]);
  });

  it('answers 404 when there is no such diagram', async () => {
    const response = await fetch(`${address}/api/diagrams/8`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'There is no diagram with the id 8.' });
  });

  for (const id of ['abc', '0', '-1', '1.5', '07', '1e3', '%20', '9999999999999999']) {
    it(`answers 400 to the id "${id}" without asking the database`, async () => {
      const response = await fetch(`${address}/api/diagrams/${id}`);

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: 'The id of a diagram is a whole number above zero.',
      });
      assert.equal(readDiagram.mock.callCount(), 0);
    });
  }

  it('answers 500 when the database fails, and keeps what went wrong to itself', async () => {
    const log = mock.method(console, 'error', () => undefined);
    readDiagram.mock.mockImplementationOnce(async () => {
      throw new Error('password authentication failed for user "postgres"');
    });

    const response = await fetch(`${address}/api/diagrams/7`);
    const body = await response.text();
    log.mock.restore();

    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(body), {
      error: 'The request could not be answered. Try again later.',
    });
    assert.doesNotMatch(body, /postgres|password/);
    assert.equal(log.mock.callCount(), 1);
  });

  it('answers 404 to an address it does not know', async () => {
    const response = await fetch(`${address}/api/funds`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'There is nothing at this address.' });
  });
});

describe('GET /api/diagrams', () => {
  it('answers with the first page when no page is asked for', async () => {
    const response = await fetch(`${address}/api/diagrams`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
    assert.deepEqual(await response.json(), await listDiagrams(1));
    assert.deepEqual(listDiagrams.mock.calls[0].arguments, [1, '']);
  });

  it('answers with the page that was asked for', async () => {
    const response = await fetch(`${address}/api/diagrams?page=3`);

    assert.equal(response.status, 200);
    const body = (await response.json()) as DiagramListPage;
    assert.equal(body.page, 3);
    assert.equal(body.items[0].name, 'Diagram 3');
    assert.deepEqual(listDiagrams.mock.calls[0].arguments, [3, '']);
  });

  it('hands the search text on, without the spaces around it', async () => {
    const search = encodeURIComponent('  Fund 50% ');

    const response = await fetch(`${address}/api/diagrams?search=${search}`);

    assert.equal(response.status, 200);
    assert.deepEqual(listDiagrams.mock.calls[0].arguments, [1, 'Fund 50%']);
  });

  it('takes a search and a page together', async () => {
    await fetch(`${address}/api/diagrams?search=meridian&page=2`);

    assert.deepEqual(listDiagrams.mock.calls[0].arguments, [2, 'meridian']);
  });

  it('treats a search of spaces only as no search', async () => {
    await fetch(`${address}/api/diagrams?search=%20%20`);

    assert.deepEqual(listDiagrams.mock.calls[0].arguments, [1, '']);
  });

  it('answers 400 to a search that is too long or given twice, without asking the database', async () => {
    for (const query of [`search=${'a'.repeat(201)}`, 'search=a&search=b']) {
      const response = await fetch(`${address}/api/diagrams?${query}`);

      assert.equal(response.status, 400, query);
      assert.deepEqual(await response.json(), {
        error: 'The search is one text of at most 200 characters.',
      });
    }
    assert.equal(listDiagrams.mock.callCount(), 0);
  });

  it('takes a search of exactly 200 characters', async () => {
    const response = await fetch(`${address}/api/diagrams?search=${'a'.repeat(200)}`);

    assert.equal(response.status, 200);
  });

  for (const page of ['abc', '0', '-1', '1.5', '02', '', '1&page=2', '9999999999']) {
    it(`answers 400 to the page "${page}" without asking the database`, async () => {
      const response = await fetch(`${address}/api/diagrams?page=${page}`);

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: 'The page is a whole number above zero.',
      });
      assert.equal(listDiagrams.mock.callCount(), 0);
    });
  }

  it('answers 500 when the database fails, and keeps what went wrong to itself', async () => {
    const log = mock.method(console, 'error', () => undefined);
    listDiagrams.mock.mockImplementationOnce(async () => {
      throw new Error('relation "diagram" does not exist');
    });

    const response = await fetch(`${address}/api/diagrams`);
    const body = await response.text();
    log.mock.restore();

    assert.equal(response.status, 500);
    assert.doesNotMatch(body, /relation|diagram/);
    assert.equal(log.mock.callCount(), 1);
  });
});
