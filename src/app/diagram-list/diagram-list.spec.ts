import { formatDate } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DiagramListPage, DiagramSummary } from '../api/diagrams-api';
import { DIAGRAM_LIST_URL, DiagramList, diagramUrl } from './diagram-list';

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
  });
});

describe('DiagramList page', () => {
  let fixture: ComponentFixture<DiagramList>;
  let page: HTMLElement;
  let backend: HttpTestingController;

  /** Shows the list at this `page` of the address; the request to the backend is still open. */
  const open = (pageInAddress?: string): void => {
    fixture = TestBed.createComponent(DiagramList);
    if (pageInAddress !== undefined) fixture.componentRef.setInput('page', pageInAddress);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  };
  /** The one request the page has sent, which has to be for this page of the list. */
  const requestFor = (pageNumber: number) =>
    backend.expectOne(
      (request) =>
        request.method === 'GET' &&
        request.url === '/api/diagrams' &&
        request.params.get('page') === String(pageNumber),
    );
  /** Answers the open request for this page with a page of the list of 45. */
  const answer = async (pageNumber: number, body = pageOf45(pageNumber)): Promise<void> => {
    requestFor(pageNumber).flush(body);
    await fixture.whenStable();
  };
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
      expect(page.querySelector('table')).toBeNull();
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
      expect(page.querySelector('table')).toBeNull();
      expect(page.querySelector('.pages')).toBeNull();
    });

    it('says that a page after the last does not exist, and leads back to the first', async () => {
      open('9');
      await answer(9);

      expect(text('.notice')).toContain('There is no page 9: the list has 3 pages.');
      expect(page.querySelector('.notice a')!.getAttribute('href')).toBe('/diagrams');
      expect(page.querySelector('table')).toBeNull();
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
      expect(page.querySelector('table')).toBeNull();
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

  it('leads to the editor from its header', async () => {
    open();
    await answer(1);

    expect(text('.bar h1')).toBe('Fund structure diagrams');
    expect(page.querySelector('.bar a')!.getAttribute('href')).toBe('/');
  });
});
