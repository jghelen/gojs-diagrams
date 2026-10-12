import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DiagramsApi } from '../api/diagrams-api';

/** The address of the list of diagrams. */
export const DIAGRAM_LIST_URL = '/diagrams';

/** The address at which the diagram with this id is opened in the editor. */
export function diagramUrl(id: number): string {
  return `${DIAGRAM_LIST_URL}/${id}`;
}

/**
 * The list of all diagrams of the database, as a table: title, created at,
 * updated at. A title opens its diagram in the editor.
 *
 * The backend hands the list out a page at a time, and decides how many
 * diagrams a page has. Which page is shown is part of the address
 * (/diagrams?page=2), so the browser's Back button and a reload keep the place.
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

  /** Bound from the `page` query parameter. */
  readonly page = input<string>();
  /** The page to show: the one in the address, or the first when the address has none that makes sense. */
  protected readonly pageNumber = computed(() => {
    const page = Number(this.page());
    return Number.isSafeInteger(page) && page >= 1 ? page : 1;
  });

  /** The page of the list, read again whenever another page is asked for. */
  protected readonly diagrams = resource({
    params: () => this.pageNumber(),
    loader: ({ params: page }) => this.api.list(page),
  });

  /** Which diagrams of all the page shows, as in "21 to 40 of 45". */
  protected readonly range = computed(() => {
    const { items, page, pageSize, total } = this.diagrams.value()!;
    const first = (page - 1) * pageSize + 1;
    return { first, last: first + items.length - 1, total };
  });

  protected readonly listUrl = DIAGRAM_LIST_URL;
  protected readonly diagramUrl = diagramUrl;
  /** How a moment is written: "12 Oct 2026, 17:23", in the time of the user's own clock. */
  protected readonly dateFormat = 'd MMM y, HH:mm';
}
