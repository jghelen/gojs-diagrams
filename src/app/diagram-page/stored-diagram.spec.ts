import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import * as go from 'gojs/release/go';
import { StoredDiagram } from '../api/diagrams-api';
import { routes } from '../app.routes';
import {
  DIAGRAM_NOT_READ_NOTICE,
  LEAVE_QUESTION,
  NO_SUCH_DIAGRAM_NOTICE,
} from '../diagram/constants';
import { NodeModel } from '../diagram/diagram-factory';
import { DiagramList } from '../diagram-list/diagram-list';
import { DiagramActions } from './diagram-actions';
import { DiagramPage } from './diagram-page';
import { DiagramState } from './diagram-state/diagram-state';
import { OperationRunner } from './operation-runner/operation-runner';

/** A diagram as the backend hands it out: three funds with positions, two relationships and an artificial link. */
function storedDiagram(change: Partial<StoredDiagram['settings']> = {}): StoredDiagram {
  const node = (key: number, title: string, loc: string) => ({
    key,
    title,
    legalEntityType: 'Private equity',
    shape: 'Ellipse' as const,
    color: '#bfdbfe',
    comment: key === 1 ? 'Only here' : '',
    loc,
    fields: [],
  });
  return {
    id: 5,
    version: 1,
    settings: {
      name: 'Meridian holdings',
      description: 'As of March',
      layoutType: 'top-bottom',
      linkType: 'avoid',
      cardsExpanded: false,
      subtitleField: null,
      subtitleUserDefinedFieldId: null,
      ...change,
    },
    nodes: [
      node(1, 'Meridian Global FoF', '840.4155888772582 -240.75846260198898'),
      node(2, 'Meridian PE Feeder', '300 400'),
      node(3, 'Buyout Fund IV', '1200.5 400'),
    ],
    links: [
      { key: 11, from: 1, to: 2, category: 'hierarchy', ownership: 64 },
      { key: 12, from: 1, to: 3, category: 'hierarchy' },
      { key: 13, from: 3, to: 2, category: 'manual' },
    ],
  };
}

describe('DiagramPage with a diagram of the database', () => {
  let harness: RouterTestingHarness;
  let backend: HttpTestingController;
  let router: Router;

  /** The editor that the address shows. */
  const editor = () => harness.routeDebugElement!.componentInstance as DiagramPage;
  const diagram = () => (editor() as unknown as { diagram: go.Diagram }).diagram;
  const model = () => diagram().model as NodeModel;
  const service = <T>(type: new (...args: never[]) => T): T =>
    harness.routeDebugElement!.injector.get(type);
  const busy = () => service(OperationRunner).busy();
  const page = () => harness.routeNativeElement as HTMLElement;
  const notice = () => page().querySelector('.failure span')?.textContent ?? null;
  const button = (label: string) =>
    page().querySelector<HTMLButtonElement>(`header button[aria-label="${label}"]`)!;

  /** Lets GoJS finish what it would do before the next frame, and Angular redraw. */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) diagram().maybeUpdate();
    await harness.fixture.whenStable();
    diagram().maybeUpdate();
    // The buttons are enabled again only once the page has been drawn anew.
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  /** Goes to an address; a request that the page sends there is still open afterwards. */
  const goTo = async (url: string): Promise<void> => {
    await harness.navigateByUrl(url);
    harness.detectChanges();
    // jsdom gives the canvas no size; this is how GoJS is told the size of the view without one.
    if (harness.routeDebugElement?.componentInstance instanceof DiagramPage) {
      diagram().viewSize = new go.Size(1000, 700);
    }
  };
  const request = (id: string) => backend.expectOne(`/api/diagrams/${id}`);
  /** Opens /diagrams/5 and answers with this diagram. */
  const openStored = async (stored = storedDiagram()): Promise<void> => {
    await goTo('/diagrams/5');
    request('5').flush(stored);
    await settle();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    backend.verify();
    vi.restoreAllMocks();
  });

  describe('opening', () => {
    it('asks the backend for the diagram of the address, and waits with an empty, locked canvas', async () => {
      await goTo('/diagrams/5');

      expect(model().nodeDataArray.length).toBe(0);
      expect(busy()).toBe(true);
      // Also after GoJS has set up the empty canvas.
      for (let i = 0; i < 3; i++) diagram().maybeUpdate();
      expect(busy()).toBe(true);
      expect(notice()).toBeNull();

      request('5').flush(storedDiagram());
      await settle();
      expect(busy()).toBe(false);
    });

    it('shows the nodes and lines of the diagram', async () => {
      await openStored();

      expect(model().nodeDataArray.map((node) => node.title)).toEqual([
        'Meridian Global FoF',
        'Meridian PE Feeder',
        'Buyout Fund IV',
      ]);
      expect(model().nodeDataArray[0]).toMatchObject({
        key: 1,
        legalEntityType: 'Private equity',
        shape: 'Ellipse',
        color: '#bfdbfe',
        comment: 'Only here',
      });
      expect(
        model().linkDataArray.map(({ key, from, to, category, ownership }) => ({
          key,
          from,
          to,
          category,
          ownership,
        })),
      ).toEqual([
        { key: 11, from: 1, to: 2, category: 'hierarchy', ownership: 64 },
        { key: 12, from: 1, to: 3, category: 'hierarchy', ownership: undefined },
        { key: 13, from: 3, to: 2, category: 'manual', ownership: undefined },
      ]);
      expect(diagram().nodes.count).toBe(3);
      expect(diagram().links.count).toBe(3);
    });

    it('leaves the nodes exactly where they were stored', async () => {
      await openStored();

      const position = (key: number) => diagram().findNodeForKey(key)!.position;
      expect([position(1).x, position(1).y]).toEqual([840.4155888772582, -240.75846260198898]);
      expect([position(2).x, position(2).y]).toEqual([300, 400]);
      expect([position(3).x, position(3).y]).toEqual([1200.5, 400]);
      expect(model().nodeDataArray[0].loc).toBe('840.4155888772582 -240.75846260198898');
    });

    it('arranges the nodes itself when some have no position yet', async () => {
      const stored = storedDiagram();
      for (const node of stored.nodes) delete node.loc;

      await openStored(stored);

      const places = [1, 2, 3].map((key) => diagram().findNodeForKey(key)!.position);
      expect(places.every((place) => place.isReal())).toBe(true);
      // Top to bottom: the fund at the top stands above the two it invests in.
      expect(places[0].y).toBeLessThan(places[1].y);
      expect(places[1].y).toBe(places[2].y);
      expect(places[1].x).not.toBe(places[2].x);
    });

    it('takes over the name, the description and the settings of the diagram', async () => {
      await openStored(
        storedDiagram({
          layoutType: 'grid',
          linkType: 'curved',
          cardsExpanded: true,
          subtitleField: 'legalEntityType',
        }),
      );

      const state = service(DiagramState);
      expect(state.name()).toBe('Meridian holdings');
      expect(state.description()).toBe('As of March');
      expect(state.layoutType()).toBe('grid');
      expect(state.linkType()).toBe('curved');
      expect(state.cardsExpanded()).toBe(true);
      expect(model().modelData).toMatchObject({
        name: 'Meridian holdings',
        layoutType: 'grid',
        linkType: 'curved',
        cardsExpanded: true,
        subtitleField: 'legalEntityType',
      });
      expect(
        page().querySelector<HTMLInputElement>('input[aria-label="Diagram name"]')?.value,
      ).toBe('Meridian holdings');
    });

    it('starts without anything to undo, and does not ask before it is left', async () => {
      const ask = vi.spyOn(window, 'confirm');

      await openStored();

      expect(model().undoManager.canUndo()).toBe(false);
      expect(editor().mayLeave()).toBe(true);
      expect(ask).not.toHaveBeenCalled();
    });

    it('shows a stored name without its special characters, and says which name it did not accept', async () => {
      await openStored(storedDiagram({ name: 'Meridian: holdings (2026)' }));

      expect(service(DiagramState).name()).toBe('Meridian holdings 2026');
      expect(service(DiagramState).refusedName()).toBe('Meridian: holdings (2026)');
    });

    it('has no dropdown to pick data from: a diagram is chosen in the list', async () => {
      await openStored();

      expect(page().querySelector('select[aria-label=Data]')).toBeNull();
      const dropdowns = [...page().querySelectorAll('header select')];
      expect(dropdowns.map((dropdown) => dropdown.getAttribute('aria-label'))).toEqual(['Actions']);
    });
  });

  describe('a new diagram', () => {
    it('is an empty canvas at /diagrams/new, for which the backend is not asked', async () => {
      await goTo('/diagrams/new');
      await settle();

      expect(model().nodeDataArray.length).toBe(0);
      expect(busy()).toBe(false);
      expect(notice()).toBeNull();
      expect(service(DiagramState).name()).toBe('');
      // afterEach checks that nothing was asked of the backend.
    });

    it('is started with "New diagram": the canvas empties at once, in the same editor', async () => {
      await openStored();
      const before = editor();

      button('New diagram').click();
      expect(model().nodeDataArray.length).toBe(0);
      await vi.waitFor(() => expect(router.url).toBe('/diagrams/new'));
      harness.detectChanges();
      await settle();

      expect(editor()).toBe(before);
      expect(editor().id()).toBe('new');
      expect(model().nodeDataArray.length).toBe(0);
      expect(busy()).toBe(false);
      expect(service(DiagramState).name()).toBe('');
    });

    it('is emptied again by "Reset diagram", without asking the backend', async () => {
      await goTo('/diagrams/new');
      await settle();
      await service(DiagramActions).addNode();
      await settle();
      expect(model().nodeDataArray.length).toBe(1);

      button('Reset diagram').click();
      await settle();

      expect(model().nodeDataArray.length).toBe(0);
      expect(model().undoManager.canUndo()).toBe(false);
    });

    it('stays where it is on "New diagram", and is emptied', async () => {
      await goTo('/diagrams/new');
      await settle();
      await service(DiagramActions).addNode();
      await settle();

      button('New diagram').click();
      await settle();

      expect(router.url).toBe('/diagrams/new');
      expect(model().nodeDataArray.length).toBe(0);
    });
  });

  describe('when the diagram does not come', () => {
    it('says that there is no such diagram, on an empty canvas that can be used', async () => {
      await goTo('/diagrams/99');
      request('99').flush({ error: 'x' }, { status: 404, statusText: 'Not Found' });
      await settle();

      expect(notice()).toBe(NO_SUCH_DIAGRAM_NOTICE);
      expect(model().nodeDataArray.length).toBe(0);
      expect(busy()).toBe(false);
    });

    it('says that the diagram could not be read when the backend fails', async () => {
      await goTo('/diagrams/5');
      request('5').flush({ error: 'x' }, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(notice()).toBe(DIAGRAM_NOT_READ_NOTICE);
      expect(busy()).toBe(false);
    });

    it('says the same when the backend cannot be reached', async () => {
      await goTo('/diagrams/5');
      request('5').error(new ProgressEvent('error'));
      await settle();

      expect(notice()).toBe(DIAGRAM_NOT_READ_NOTICE);
      expect(busy()).toBe(false);
    });

    it('reads the diagram again on "Reset diagram"', async () => {
      await goTo('/diagrams/5');
      request('5').flush({ error: 'x' }, { status: 500, statusText: 'Server Error' });
      await settle();

      page().querySelector<HTMLButtonElement>('button[aria-label="Reset diagram"]')!.click();
      harness.detectChanges();
      request('5').flush(storedDiagram());
      await settle();

      expect(notice()).toBeNull();
      expect(model().nodeDataArray.length).toBe(3);
    });
  });

  describe('going on from a stored diagram', () => {
    it('reads the diagram anew on "Reset diagram", dropping the changes', async () => {
      await openStored();
      await service(DiagramActions).addNode();
      await settle();
      expect(model().nodeDataArray.length).toBe(4);

      page().querySelector<HTMLButtonElement>('button[aria-label="Reset diagram"]')!.click();
      harness.detectChanges();
      request('5').flush(storedDiagram());
      await settle();

      expect(model().nodeDataArray.length).toBe(3);
      expect(model().undoManager.canUndo()).toBe(false);
    });

    it('reads the diagram again when the Back button returns to its address', async () => {
      await openStored();
      button('New diagram').click();
      await vi.waitFor(() => expect(router.url).toBe('/diagrams/new'));
      harness.detectChanges();
      await settle();

      await goTo('/diagrams/5');
      request('5').flush(storedDiagram());
      await settle();

      expect(model().nodeDataArray.length).toBe(3);
      expect(service(DiagramState).name()).toBe('Meridian holdings');
    });

    it('opens the other diagram when the address changes to it, in the same editor', async () => {
      await openStored();
      const before = editor();

      await goTo('/diagrams/6');
      // The canvas is empty and locked while the other diagram is on its way.
      expect(model().nodeDataArray.length).toBe(0);
      expect(busy()).toBe(true);
      const other = storedDiagram({ name: 'Another diagram' });
      other.nodes.pop();
      other.links = other.links.filter((link) => link.from !== 3 && link.to !== 3);
      request('6').flush(other);
      await settle();

      expect(editor()).toBe(before);
      expect(model().nodeDataArray.length).toBe(2);
      expect(service(DiagramState).name()).toBe('Another diagram');
      expect(model().undoManager.canUndo()).toBe(false);
    });

    it('drops a diagram that arrives after a new diagram was started', async () => {
      await goTo('/diagrams/5');
      const late = request('5');

      // The button is disabled while the diagram is on its way; this is what it does.
      (editor() as unknown as { startNew(): void }).startNew();
      late.flush(storedDiagram());
      await vi.waitFor(() => expect(router.url).toBe('/diagrams/new'));
      harness.detectChanges();
      await settle();

      expect(model().nodeDataArray.length).toBe(0);
      expect(busy()).toBe(false);
    });

    it('drops a diagram that arrives after the address moved on to another', async () => {
      await goTo('/diagrams/5');
      const late = request('5');

      await goTo('/diagrams/6');
      late.flush(storedDiagram());
      const other = storedDiagram({ name: 'Another diagram' });
      request('6').flush(other);
      await settle();

      expect(service(DiagramState).name()).toBe('Another diagram');
    });
  });

  describe('leaving for the list of diagrams', () => {
    it('leads there from the header', async () => {
      await openStored();

      const link = page().querySelector<HTMLAnchorElement>('.bar a.all-diagrams')!;
      expect(link.textContent!.trim()).toBe('All diagrams');
      expect(link.getAttribute('href')).toBe('/diagrams');
    });

    it('goes without a question while nothing was changed', async () => {
      const ask = vi.spyOn(window, 'confirm');
      await openStored();

      await goTo('/diagrams');

      expect(ask).not.toHaveBeenCalled();
      expect(harness.routeDebugElement!.componentInstance).toBeInstanceOf(DiagramList);
      backend
        .expectOne((list) => list.url === '/api/diagrams')
        .flush({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        });
    });

    it('asks first when the diagram has changes, and stays on a "no"', async () => {
      const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
      await openStored();
      await service(DiagramActions).addNode();
      await settle();

      await router.navigateByUrl('/diagrams');
      harness.detectChanges();

      expect(ask).toHaveBeenCalledWith(LEAVE_QUESTION);
      expect(router.url).toBe('/diagrams/5');
      expect(model().nodeDataArray.length).toBe(4);
    });

    it('leaves on a "yes"', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await openStored();
      await service(DiagramActions).addNode();
      await settle();

      await goTo('/diagrams');

      expect(router.url).toBe('/diagrams');
      backend.expectOne((list) => list.url === '/api/diagrams');
    });

    it('does not ask again once every change is undone', async () => {
      const ask = vi.spyOn(window, 'confirm');
      await openStored();
      await service(DiagramActions).addNode();
      await service(DiagramActions).undo();
      await settle();

      expect(editor().mayLeave()).toBe(true);
      expect(ask).not.toHaveBeenCalled();
    });
  });
});
