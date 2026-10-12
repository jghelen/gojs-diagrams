import { formatDate } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DiagramListPage, DiagramSummary } from '../api/diagrams-api';
import {
  DIAGRAM_LIST_URL,
  DiagramList,
  NEW_DIAGRAM_URL,
  SEARCH_DELAY_MS,
  diagramUrl,
} from './diagram-list';

/** The diagrams `from` to `to` of a list, numbered from 1. */
function summaries(from: number, to: number): DiagramSummary[] {
  return Array.from({ length: to - from + 1 }, (_, index) => ({
    id: 100 + from + index,
    name: `Fund structure ${from + index}`,
    createdAt: '2026-09-01T08:05:00.000Z',
    updatedAt: '2026-10-12T17:23:58.700Z',
  }));
}

/** A page of a list of 45 diagrams, as the backend hands it out. */
function pageOf45(page: number): DiagramListPage {
  const first = (page - 1) * 20 + 1;
  return {
    items: first > 45 ? [] : summaries(first, Math.min(first + 19, 45)),
    page,
    pageSize: 20,
    total: 45,
    totalPages: 3,
  };
}

describe('addresses of the diagrams', () => {
  it('has the list at /diagrams and a diagram below it', () => {
    expect(DIAGRAM_LIST_URL).toBe('/diagrams');
    expect(diagramUrl(17)).toBe('/diagrams/17');
    expect(NEW_DIAGRAM_URL).toBe('/diagrams/new');
  });
});

describe('DiagramList page', () => {
  let fixture: ComponentFixture<DiagramList>;
  let page: HTMLElement;
  let backend: HttpTestingController;

  /** Shows the list at this `page` and `search` of the address; the request to the backend is still open. */
  const open = (pageInAddress?: string, searchInAddress?: string): void => {
    fixture = TestBed.createComponent(DiagramList);
    if (pageInAddress !== undefined) fixture.componentRef.setInput('page', pageInAddress);
    if (searchInAddress !== undefined) fixture.componentRef.setInput('search', searchInAddress);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  };
  /** The one request the page has sent, which has to be for this page of the list and this search. */
  const requestFor = (pageNumber: number, search: string | null = null) =>
    backend.expectOne(
      (request) =>
        request.method === 'GET' &&
        request.url === '/api/diagrams' &&
        request.params.get('page') === String(pageNumber) &&
        request.params.get('search') === search,
    );
  /** Answers the open request for this page with a page of the list of 45. */
  const answer = async (
    pageNumber: number,
    body = pageOf45(pageNumber),
    search: string | null = null,
  ): Promise<void> => {
    requestFor(pageNumber, search).flush(body);
    await fixture.whenStable();
  };
  const rows = () => page.querySelectorAll('tbody tr td a[title]').length;
  const texts = (selector: string): string[] =>
    [...page.querySelectorAll(selector)].map((element) => element.textContent!.trim());
  const text = (selector: string): string =>
    page.querySelector(selector)!.textContent!.replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DiagramList],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  describe('reading the list', () => {
    it('asks the backend for the first page, and says so while it waits', async () => {
      open();

      expect(text('[role=status]')).toBe('Reading the diagrams…');
      expect(rows()).toBe(0);
      await answer(1);
      expect(page.querySelector('[role=status]')).toBeNull();
    });

    it('shows the title, created at and updated at of every diagram of the page', async () => {
      open();
      await answer(1);

      expect(texts('thead th')).toEqual(['Title', 'Created at', 'Updated at']);
      expect(page.querySelectorAll('tbody tr').length).toBe(20);
      const [title, created, updated] = texts('tbody tr:first-child td');
      expect(title).toBe('Fund structure 1');
      // In the time of the clock of whoever looks at it.
      expect(created).toBe(formatDate('2026-09-01T08:05:00.000Z', 'd MMM y, HH:mm', 'en-US'));
      expect(updated).toBe(formatDate('2026-10-12T17:23:58.700Z', 'd MMM y, HH:mm', 'en-US'));
      expect(created).toMatch(/^\d{1,2} Sep 2026, \d{2}:\d{2}$/);
    });

    it('keeps the exact moment with each date, for machines', async () => {
      open();
      await answer(1);

      const times = page.querySelectorAll('tbody tr:first-child time');
      expect([...times].map((time) => time.getAttribute('datetime'))).toEqual([
        '2026-09-01T08:05:00.000Z',
        '2026-10-12T17:23:58.700Z',
      ]);
    });

    it('makes every title a link that opens the diagram in the editor', async () => {
      open();
      await answer(1);

      const links = [...page.querySelectorAll<HTMLAnchorElement>('tbody td:first-child a')];
      expect(links.length).toBe(20);
      expect(links[0].getAttribute('href')).toBe('/diagrams/101');
      expect(links[19].getAttribute('href')).toBe('/diagrams/120');
      // In the same tab.
      expect(links.every((link) => link.target === '')).toBe(true);
    });

    it('shows as many rows as the backend sends, without deciding the page size itself', async () => {
      open();
      await answer(1, { items: summaries(1, 7), page: 1, pageSize: 7, total: 9, totalPages: 2 });

      expect(page.querySelectorAll('tbody tr').length).toBe(7);
      expect(text('.where')).toBe('Page 1 of 2 · diagrams 1 to 7 of 9');
    });
  });

  describe('pages', () => {
    it('asks the backend for the page of the address', async () => {
      open('2');
      await answer(2);

      expect(texts('tbody tr:first-child td')[0]).toBe('Fund structure 21');
      expect(text('.where')).toBe('Page 2 of 3 · diagrams 21 to 40 of 45');
    });

    for (const nonsense of ['abc', '0', '-3', '1.5', '', '1e999']) {
      it(`shows the first page when the address says page "${nonsense}"`, async () => {
        open(nonsense);
        await answer(1);

        expect(text('.where')).toBe('Page 1 of 3 · diagrams 1 to 20 of 45');
      });
    }

    it('on the first page offers the next page and no previous one', async () => {
      open();
      await answer(1);

      const [previous, next] = page.querySelectorAll('.pages .step');
      expect(previous.tagName).toBe('SPAN');
      expect(previous.getAttribute('aria-disabled')).toBe('true');
      expect(next.tagName).toBe('A');
      expect(next.getAttribute('href')).toBe('/diagrams?page=2');
    });

    it('on a page in the middle offers both', async () => {
      open('2');
      await answer(2);

      const [previous, next] = page.querySelectorAll('.pages .step');
      expect(previous.getAttribute('href')).toBe('/diagrams?page=1');
      expect(next.getAttribute('href')).toBe('/diagrams?page=3');
    });

    it('on the last page offers the previous page and no next one', async () => {
      open('3');
      await answer(3);

      const [previous, next] = page.querySelectorAll('.pages .step');
      expect(previous.getAttribute('href')).toBe('/diagrams?page=2');
      expect(next.tagName).toBe('SPAN');
      expect(next.getAttribute('aria-disabled')).toBe('true');
      expect(page.querySelectorAll('tbody tr').length).toBe(5);
      expect(text('.where')).toBe('Page 3 of 3 · diagrams 41 to 45 of 45');
    });

    it('reads the other page when the page of the address changes', async () => {
      open();
      await answer(1);

      fixture.componentRef.setInput('page', '3');
      fixture.detectChanges();
      await answer(3);

      expect(texts('tbody tr:first-child td')[0]).toBe('Fund structure 41');
    });

    it('offers neither on a list of one page', async () => {
      open();
      await answer(1, { items: summaries(1, 3), page: 1, pageSize: 20, total: 3, totalPages: 1 });

      expect(page.querySelectorAll('.pages a').length).toBe(0);
      expect(text('.where')).toBe('Page 1 of 1 · diagrams 1 to 3 of 3');
    });
  });

  describe('when there is nothing to show', () => {
    it('says that there are no diagrams yet', async () => {
      open();
      await answer(1, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });

      expect(text('.notice')).toBe('There are no diagrams yet.');
      expect(rows()).toBe(0);
      expect(page.querySelector('.pages')).toBeNull();
    });

    it('says that a page after the last does not exist, and leads back to the first', async () => {
      open('9');
      await answer(9);

      expect(text('.notice')).toContain('There is no page 9: the list has 3 pages.');
      expect(page.querySelector('.notice a')!.getAttribute('href')).toBe('/diagrams');
      expect(rows()).toBe(0);
      expect(page.querySelector('.pages')).toBeNull();
    });
  });

  describe('when the backend does not answer', () => {
    const fail = async (): Promise<void> => {
      requestFor(1).flush({ error: 'x' }, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
    };

    it('says that the list could not be read', async () => {
      open();
      await fail();

      expect(text('[role=alert] p')).toBe(
        'The list of diagrams could not be read. Check that the backend is running.',
      );
      expect(rows()).toBe(0);
      expect(page.querySelector('.pages')).toBeNull();
    });

    it('reads the list again on "Try again"', async () => {
      open();
      await fail();

      page.querySelector<HTMLButtonElement>('[role=alert] button')!.click();
      fixture.detectChanges();
      await answer(1);

      expect(page.querySelector('[role=alert]')).toBeNull();
      expect(page.querySelectorAll('tbody tr').length).toBe(20);
    });
  });

  describe('searching by title, from the address', () => {
    const none: DiagramListPage = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };

    it('has a search box below the heading "Title"', async () => {
      open();
      await answer(1);

      const box = page.querySelector<HTMLInputElement>(
        'thead tr:nth-child(2) td:first-child input',
      )!;
      expect(box.type).toBe('search');
      expect(box.getAttribute('aria-label')).toBe('Search by title');
      expect(box.placeholder).toBe('Search by title');
      expect(box.value).toBe('');
      // The headings stay the three they were.
      expect(texts('thead th')).toEqual(['Title', 'Created at', 'Updated at']);
    });

    it('shows the box before the list has arrived, and when it cannot be read', async () => {
      open();
      expect(page.querySelector('input[type=search]')).not.toBeNull();

      requestFor(1).flush({ error: 'x' }, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      expect(page.querySelector('input[type=search]')).not.toBeNull();
    });

    it('asks the backend for the diagrams with the text of the address in their title', async () => {
      open(undefined, 'structure 4');
      await answer(
        1,
        { items: summaries(40, 45), page: 1, pageSize: 20, total: 6, totalPages: 1 },
        'structure 4',
      );

      expect(page.querySelector<HTMLInputElement>('input[type=search]')!.value).toBe('structure 4');
      expect(rows()).toBe(6);
      expect(text('.where')).toBe('Page 1 of 1 · diagrams 1 to 6 of 6');
    });

    it('asks for the page of the address within what was found', async () => {
      open('2', 'fund');
      await answer(2, pageOf45(2), 'fund');

      expect(text('.where')).toBe('Page 2 of 3 · diagrams 21 to 40 of 45');
    });

    it('leaves the spaces around the text out of the search', async () => {
      open(undefined, '  fund  ');
      await answer(1, pageOf45(1), 'fund');

      expect(rows()).toBe(20);
    });

    it('does not search for a text of spaces only', async () => {
      open(undefined, '   ');
      await answer(1);

      expect(rows()).toBe(20);
    });

    it('says so when no title has the text', async () => {
      open(undefined, 'no such thing');
      await answer(1, none, 'no such thing');

      expect(text('.notice')).toBe('No diagram has “no such thing” in its title.');
      expect(rows()).toBe(0);
      expect(page.querySelector('.pages')).toBeNull();
      // The box is still there, to search for something else.
      expect(page.querySelector('input[type=search]')).not.toBeNull();
    });

    it('keeps the rows on screen while the next search is on its way', async () => {
      open();
      await answer(1);

      fixture.componentRef.setInput('search', 'meridian');
      fixture.detectChanges();

      expect(rows()).toBe(20);
      expect(page.querySelector('[role=status]')).toBeNull();
      expect(page.querySelector('table')!.getAttribute('aria-busy')).toBe('true');
      await answer(1, { ...none, items: summaries(7, 7), total: 1, totalPages: 1 }, 'meridian');
      expect(rows()).toBe(1);
      expect(page.querySelector('table')!.getAttribute('aria-busy')).toBe('false');
    });

    it('follows the address when the search in it changes, as after the Back button', async () => {
      open(undefined, 'fund');
      await answer(1, pageOf45(1), 'fund');

      fixture.componentRef.setInput('search', undefined);
      fixture.detectChanges();
      await answer(1);

      expect(page.querySelector<HTMLInputElement>('input[type=search]')!.value).toBe('');
    });
  });

  it('offers to start a new diagram from its header', async () => {
    open();
    await answer(1);

    expect(text('.bar h1')).toBe('Fund structure diagrams');
    expect(text('.bar a')).toBe('New diagram');
    expect(page.querySelector('.bar a')!.getAttribute('href')).toBe('/diagrams/new');
  });
});

describe('DiagramList page, typing a search', () => {
  let harness: RouterTestingHarness;
  let backend: HttpTestingController;
  let router: Router;

  const page = () => harness.routeNativeElement as HTMLElement;
  const box = () => page().querySelector<HTMLInputElement>('input[type=search]')!;
  const found: DiagramListPage = {
    items: summaries(1, 2),
    page: 1,
    pageSize: 20,
    total: 2,
    totalPages: 1,
  };
  /** Answers the one open request, which has to be for this page and this search. */
  const answer = async (pageNumber: number, search: string | null, body = found): Promise<void> => {
    backend
      .expectOne(
        (request) =>
          request.url === '/api/diagrams' &&
          request.params.get('page') === String(pageNumber) &&
          request.params.get('search') === search,
      )
      .flush(body);
    await harness.fixture.whenStable();
  };
  const goTo = async (url: string): Promise<void> => {
    await harness.navigateByUrl(url);
    harness.detectChanges();
  };
  /** What a key in the search box does: the box has this text afterwards. */
  const type = (text: string): void => {
    box().value = text;
    box().dispatchEvent(new Event('input'));
  };
  const pressEnter = (): void => {
    box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  };
  /** Waits until the address is this one, and lets the page follow it. */
  const addressIs = async (url: string): Promise<void> => {
    await vi.waitFor(() => expect(router.url).toBe(url));
    harness.detectChanges();
  };
  /** Lets the time after the last key pass. */
  const pause = (ms = SEARCH_DELAY_MS): void => {
    vi.advanceTimersByTime(ms);
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'diagrams', component: DiagramList },
            { path: '**', component: DiagramList },
          ],
          withComponentInputBinding(),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
    await goTo('/diagrams');
    await answer(1, null, pageOf45(1));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    backend.verify();
  });

  it('searches a moment after the last key, not with every key', async () => {
    type('m');
    pause(SEARCH_DELAY_MS - 1);
    type('me');
    pause(SEARCH_DELAY_MS - 1);
    type('mer');
    pause(SEARCH_DELAY_MS - 1);

    // Nothing was asked of the backend yet, and the address is as it was.
    backend.expectNone(() => true);
    expect(router.url).toBe('/diagrams');

    pause(1);
    vi.useRealTimers();
    await addressIs('/diagrams?search=mer');
    await answer(1, 'mer');

    expect(page().querySelectorAll('tbody td a[title]').length).toBe(2);
    expect(box().value).toBe('mer');
  });

  it('searches at once on Enter', async () => {
    type('meridian');
    pressEnter();
    vi.useRealTimers();

    await addressIs('/diagrams?search=meridian');
    await answer(1, 'meridian');
    // The moment after the key does not search a second time.
    backend.expectNone(() => true);
  });

  it('starts at the first page of what it finds', async () => {
    vi.useRealTimers();
    await goTo('/diagrams?page=3');
    await answer(3, null, pageOf45(3));

    type('fund');
    pressEnter();

    await addressIs('/diagrams?search=fund');
    await answer(1, 'fund', pageOf45(1));
  });

  it('keeps the search when going to the next and the previous page', async () => {
    type('fund');
    pressEnter();
    vi.useRealTimers();
    await addressIs('/diagrams?search=fund');
    await answer(1, 'fund', pageOf45(1));

    const next = page().querySelector<HTMLAnchorElement>('.pages a.step')!;
    expect(next.getAttribute('href')).toBe('/diagrams?search=fund&page=2');
    next.click();
    await addressIs('/diagrams?search=fund&page=2');
    await answer(2, 'fund', pageOf45(2));

    const [previous] = page().querySelectorAll<HTMLAnchorElement>('.pages a.step');
    expect(previous.getAttribute('href')).toBe('/diagrams?search=fund&page=1');
    expect(box().value).toBe('fund');
  });

  it('leads back to the first page of the search from a page that does not exist', async () => {
    vi.useRealTimers();
    await goTo('/diagrams?search=fund&page=9');
    await answer(9, 'fund', pageOf45(9));

    expect(page().querySelector('.notice a')!.getAttribute('href')).toBe('/diagrams?search=fund');
  });

  it('shows every diagram again when the box is emptied', async () => {
    type('fund');
    pressEnter();
    vi.useRealTimers();
    await addressIs('/diagrams?search=fund');
    await answer(1, 'fund');

    type('');
    pressEnter();

    await addressIs('/diagrams');
    await answer(1, null, pageOf45(1));
    expect(page().querySelectorAll('tbody td a[title]').length).toBe(20);
  });

  it('searches without the spaces around the text, and leaves them in the box', async () => {
    type('  fund ');
    pressEnter();
    vi.useRealTimers();

    await addressIs('/diagrams?search=fund');
    await answer(1, 'fund');
    // The space at the end is where the next word goes.
    expect(box().value).toBe('  fund ');
  });

  it('does not search again for the text that is already shown', async () => {
    type('fund');
    pressEnter();
    vi.useRealTimers();
    await addressIs('/diagrams?search=fund');
    await answer(1, 'fund');

    type('fund ');
    pressEnter();
    type('   ');
    type('fund');
    pressEnter();
    await new Promise((resolve) => setTimeout(resolve, 20));

    backend.expectNone(() => true);
    expect(router.url).toBe('/diagrams?search=fund');
  });

  it('takes the place of the address before it, so that Back leaves the list', async () => {
    const navigate = vi.spyOn(router, 'navigate');

    type('fund');
    pressEnter();
    vi.useRealTimers();
    await addressIs('/diagrams?search=fund');
    await answer(1, 'fund');

    expect(navigate).toHaveBeenCalledWith(['/diagrams'], {
      queryParams: { search: 'fund' },
      replaceUrl: true,
    });
  });

  it('writes a text with special characters into the address so that it comes back whole', async () => {
    type('50% & more?');
    pressEnter();
    vi.useRealTimers();

    await vi.waitFor(() => expect(router.url).toContain('search='));
    harness.detectChanges();
    await answer(1, '50% & more?', { ...found, items: [], total: 0, totalPages: 0 });

    expect(page().querySelector('.notice')!.textContent).toContain(
      'No diagram has “50% & more?” in its title.',
    );
  });

  it('does not search after the page was left', async () => {
    type('fund');
    vi.useRealTimers();
    const navigate = vi.spyOn(router, 'navigate');

    harness.fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS + 50));

    expect(navigate).not.toHaveBeenCalled();
  });
});
