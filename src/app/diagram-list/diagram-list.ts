import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DiagramListPage, DiagramsApi } from '../api/diagrams-api';

/** The address of the list of diagrams. */
export const DIAGRAM_LIST_URL = '/diagrams';

/** What stands in the address in place of an id for a diagram that is new. */
export const NEW_DIAGRAM_ID = 'new';
/** The address at which the editor starts a new diagram, on an empty canvas. */
export const NEW_DIAGRAM_URL = `${DIAGRAM_LIST_URL}/${NEW_DIAGRAM_ID}`;

/** The address at which the diagram with this id is opened in the editor. */
export function diagramUrl(id: number): string {
  return `${DIAGRAM_LIST_URL}/${id}`;
}

/** How long the page waits after a key before it searches, so that it does not search for every letter. */
export const SEARCH_DELAY_MS = 300;
/** How long a search text may be; the backend takes no longer one. */
export const MAX_SEARCH_LENGTH = 200;

/** A page of the list, with the search text it was read for. */
type ShownList = DiagramListPage & { search: string };

/**
 * The list of the diagrams of the database, as a table: title, created at,
 * updated at. A title opens its diagram in the editor. The box below the
 * heading "Title" searches the titles.
 *
 * The backend hands the list out a page at a time; it decides how many diagrams
 * a page has, and it does the searching. Which page is shown and what is
 * searched for are part of the address (/diagrams?search=fund&page=2), so the
 * browser's Back button and a reload keep the place.
 */
@Component({
  selector: 'app-diagram-list',
  templateUrl: './diagram-list.html',
  styleUrl: './diagram-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe],
})
export class DiagramList {
  private readonly api = inject(DiagramsApi);
  private readonly router = inject(Router);

  /** Bound from the `page` query parameter. */
  readonly page = input<string>();
  /** Bound from the `search` query parameter: the text the titles are searched for. */
  readonly search = input<string>();

  /** The page to show: the one in the address, or the first when the address has none that makes sense. */
  protected readonly pageNumber = computed(() => {
    const page = Number(this.page());
    return Number.isSafeInteger(page) && page >= 1 ? page : 1;
  });
  /** What is searched for: the text of the address without the spaces around it; empty for no search. */
  protected readonly searchText = computed(() =>
    (this.search() ?? '').trim().slice(0, MAX_SEARCH_LENGTH),
  );
  /**
   * What stands in the search box. It follows the address, for the Back button,
   * and runs ahead of it while the user types. A space typed at the end is kept
   * although the address does not have it: the next word is about to follow.
   */
  protected readonly typed = linkedSignal<string, string>({
    source: this.searchText,
    computation: (text, before) => (before?.value.trim() === text ? before.value : text),
  });

  /** The page of the list, read again whenever another page or another text is asked for. */
  protected readonly diagrams = resource({
    params: () => ({ page: this.pageNumber(), search: this.searchText() }),
    loader: async ({ params }): Promise<ShownList> => ({
      ...(await this.api.list(params.page, params.search)),
      search: params.search,
    }),
  });
  /**
   * The list that was read last. It stays on screen while the next one is on
   * its way, so that the table does not flicker with every letter typed.
   */
  protected readonly list = linkedSignal<ShownList | undefined, ShownList | undefined>({
    source: () => (this.diagrams.hasValue() ? this.diagrams.value() : undefined),
    computation: (now, before) => now ?? before?.value,
  });

  /** Which diagrams of all the page shows, as in "21 to 40 of 45". */
  protected readonly range = computed(() => {
    const { items, page, pageSize, total } = this.list()!;
    const first = (page - 1) * pageSize + 1;
    return { first, last: first + items.length - 1, total };
  });

  protected readonly listUrl = DIAGRAM_LIST_URL;
  protected readonly newDiagramUrl = NEW_DIAGRAM_URL;
  protected readonly diagramUrl = diagramUrl;
  protected readonly maxSearchLength = MAX_SEARCH_LENGTH;
  /** How a moment is written: "12 Oct 2026, 17:23", in the time of the user's own clock. */
  protected readonly dateFormat = 'd MMM y, HH:mm';

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  /** The user typed in the search box: search once they have stopped for a moment. */
  protected type(text: string): void {
    this.typed.set(text);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.searchFor(text), SEARCH_DELAY_MS);
  }

  /** The Enter key in the search box: search without waiting. */
  protected searchNow(): void {
    clearTimeout(this.searchTimer);
    this.searchFor(this.typed());
  }

  /**
   * Puts the text into the address, which is what makes the list read anew.
   * The search starts at the first page of what it finds. It takes the place of
   * the address before it, so that Back leaves the list instead of walking
   * through everything that was typed.
   */
  private searchFor(text: string): void {
    const search = text.trim();
    if (search === this.searchText()) return;
    void this.router.navigate([DIAGRAM_LIST_URL], {
      queryParams: search ? { search } : {},
      replaceUrl: true,
    });
  }
}
