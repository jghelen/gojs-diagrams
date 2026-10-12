import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UrlSegment, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { editorAddress, routes } from './app.routes';
import { DiagramList } from './diagram-list/diagram-list';
import { DiagramPage } from './diagram-page/diagram-page';
import { NewBatch } from './new-batch/new-batch';

const segments = (path: string): UrlSegment[] =>
  path
    .split('/')
    .filter(Boolean)
    .map((part) => new UrlSegment(part, {}));

describe('editorAddress', () => {
  it('takes the address of the app itself', () => {
    expect(editorAddress(segments('/'))).toEqual({ consumed: [] });
  });

  it('takes the address of a stored diagram, and gives its id', () => {
    const match = editorAddress(segments('/diagrams/17'))!;

    expect(match.consumed.map((segment) => segment.path)).toEqual(['diagrams', '17']);
    expect(match.posParams!['id'].path).toBe('17');
  });

  it('leaves every other address alone', () => {
    for (const path of ['/diagrams', '/diagrams/17/edit', '/batches/new', '/funds/17']) {
      expect(editorAddress(segments(path)), path).toBeNull();
    }
  });
});

describe('the addresses of the app', () => {
  let harness: RouterTestingHarness;

  const shown = async (url: string): Promise<unknown> => {
    await harness.navigateByUrl(url);
    return harness.routeDebugElement!.componentInstance;
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it('shows the editor at /, without the id of a stored diagram', async () => {
    const page = await shown('/');

    expect(page).toBeInstanceOf(DiagramPage);
    expect((page as DiagramPage).id()).toBeUndefined();
  });

  it('shows the list of diagrams at /diagrams, with the page of the address', async () => {
    expect(await shown('/diagrams?page=2')).toBeInstanceOf(DiagramList);
    TestBed.inject(HttpTestingController).expectOne('/api/diagrams?page=2');
  });

  it('shows the editor at /diagrams/<id>, with that id', async () => {
    const page = await shown('/diagrams/17');

    expect(page).toBeInstanceOf(DiagramPage);
    expect((page as DiagramPage).id()).toBe('17');
  });

  it('shows the batch page at /batches/new', async () => {
    expect(await shown('/batches/new?nodeId=3')).toBeInstanceOf(NewBatch);
  });

  it('leads any other address to the editor', async () => {
    const page = await shown('/nothing/here/at/all');

    expect(page).toBeInstanceOf(DiagramPage);
    expect((page as DiagramPage).id()).toBeUndefined();
  });
});
