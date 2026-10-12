import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DiagramsApi, StoredDiagram, nodesAndLinksOf } from './diagrams-api';

const STORED: StoredDiagram = {
  id: 5,
  version: 2,
  settings: {
    name: 'Meridian holdings',
    description: '',
    layoutType: 'grid',
    linkType: 'curved',
    cardsExpanded: false,
    subtitleField: null,
    subtitleUserDefinedFieldId: null,
  },
  nodes: [
    {
      key: 1,
      title: 'Meridian Global FoF',
      legalEntityType: 'Fund of funds',
      shape: 'Ellipse',
      color: '#bfdbfe',
      comment: 'Only here',
      loc: '840.4155888772582 -240.75846260198898',
      fields: [{ id: 1, name: 'Jurisdiction', dataType: 'text', isOptional: false, value: 'LU' }],
    },
    {
      key: 2,
      title: 'Meridian PE Feeder',
      legalEntityType: 'Feeder fund',
      shape: 'Rectangle',
      color: '#f3f4f6',
      comment: '',
      fields: [],
    },
  ],
  links: [
    { key: 7, from: 1, to: 2, category: 'hierarchy', ownership: 64 },
    { key: 8, from: 2, to: 1, category: 'manual' },
  ],
};

describe('DiagramsApi', () => {
  let api: DiagramsApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DiagramsApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('asks for a page of the list by its number', async () => {
    const page = { items: [], page: 2, pageSize: 20, total: 0, totalPages: 0 };

    const answer = api.list(2);
    const request = backend.expectOne('/api/diagrams?page=2');
    request.flush(page);

    expect(request.request.method).toBe('GET');
    expect(await answer).toEqual(page);
  });

  it('asks for a diagram by its id', async () => {
    const answer = api.read('5');
    const request = backend.expectOne('/api/diagrams/5');
    request.flush(STORED);

    expect(request.request.method).toBe('GET');
    expect(await answer).toEqual(STORED);
  });

  it('keeps an id that is not a number inside its place in the address', () => {
    void api.read('5/../../x?y').catch(() => undefined);

    backend
      .expectOne('/api/diagrams/5%2F..%2F..%2Fx%3Fy')
      .flush(null, { status: 400, statusText: 'Bad' });
  });

  it('fails when the backend says there is no such diagram', async () => {
    const answer = api.read('99');
    backend
      .expectOne('/api/diagrams/99')
      .flush({ error: 'x' }, { status: 404, statusText: 'Not Found' });

    await expect(answer).rejects.toMatchObject({ status: 404 });
  });
});

describe('nodesAndLinksOf', () => {
  it('gives the nodes as the editor holds them, without the user-defined fields', () => {
    expect(nodesAndLinksOf(STORED).nodes).toEqual([
      {
        key: 1,
        title: 'Meridian Global FoF',
        legalEntityType: 'Fund of funds',
        shape: 'Ellipse',
        color: '#bfdbfe',
        comment: 'Only here',
        loc: '840.4155888772582 -240.75846260198898',
      },
      {
        key: 2,
        title: 'Meridian PE Feeder',
        legalEntityType: 'Feeder fund',
        shape: 'Rectangle',
        color: '#f3f4f6',
        comment: '',
      },
    ]);
  });

  it('leaves the position out, not empty, for a node that has none', () => {
    expect('loc' in nodesAndLinksOf(STORED).nodes[1]).toBe(false);
  });

  it('gives relationships and artificial links as lines', () => {
    const { links } = nodesAndLinksOf(STORED);

    expect(links).toEqual([
      { key: 7, from: 1, to: 2, category: 'hierarchy', ownership: 64 },
      { key: 8, from: 2, to: 1, category: 'manual' },
    ]);
    expect('ownership' in links[1]).toBe(false);
  });

  it('hands out new objects, so that the editor changes its own', () => {
    const { nodes, links } = nodesAndLinksOf(STORED);

    expect(nodes[0]).not.toBe(STORED.nodes[0]);
    expect(links[0]).not.toBe(STORED.links[0]);
  });
});
