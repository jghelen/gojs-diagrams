import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { DiagramList } from './diagram-list/diagram-list';
import { DiagramPage } from './diagram-page/diagram-page';
import { NewBatch } from './new-batch/new-batch';

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

  it('starts with the list of diagrams', async () => {
    expect(await shown('/')).toBeInstanceOf(DiagramList);
    expect(TestBed.inject(Router).url).toBe('/diagrams');
    TestBed.inject(HttpTestingController).expectOne('/api/diagrams?page=1');
  });

  it('shows the editor with an empty canvas at /diagrams/new, without asking the backend', async () => {
    const page = await shown('/diagrams/new');
    harness.detectChanges();

    expect(page).toBeInstanceOf(DiagramPage);
    expect((page as DiagramPage).id()).toBe('new');
    TestBed.inject(HttpTestingController).verify();
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

  it('leads any other address to the list of diagrams', async () => {
    expect(await shown('/nothing/here/at/all')).toBeInstanceOf(DiagramList);
    expect(TestBed.inject(Router).url).toBe('/diagrams');
  });
});
