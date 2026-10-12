import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LayoutType } from '../diagram/layouts';
import { LinkType } from '../diagram/link-types';
import { LinkData, NodeData } from '../diagram/node-data';

/** A diagram as a row of the list of all diagrams. */
export interface DiagramSummary {
  id: number;
  name: string;
  /** Moments in time, as "2026-10-12T17:23:58.700Z". */
  createdAt: string;
  updatedAt: string;
}

/** One page of the list of all diagrams, as the backend hands it out. */
export interface DiagramListPage {
  items: DiagramSummary[];
  /** Which page this is, counting from 1. */
  page: number;
  /** How many diagrams a page has at most. */
  pageSize: number;
  /** How many diagrams there are on all pages together. */
  total: number;
  totalPages: number;
}

/** A diagram of the database, as the backend hands it out. */
export interface StoredDiagram {
  id: number;
  version: number;
  settings: {
    name: string;
    description: string;
    layoutType: LayoutType;
    linkType: LinkType;
    cardsExpanded: boolean;
    subtitleField: 'legalEntityType' | null;
    subtitleUserDefinedFieldId: number | null;
  };
  /** A node also carries the user-defined fields of its legal entity, which the app does not show yet. */
  nodes: (NodeData & { fields: unknown[] })[];
  links: LinkData[];
}

/**
 * The nodes and lines of a stored diagram, as the editor holds them. The
 * user-defined fields are left behind: the editor has nothing to show them with yet.
 */
export function nodesAndLinksOf(stored: StoredDiagram): { nodes: NodeData[]; links: LinkData[] } {
  return {
    nodes: stored.nodes.map(({ key, title, legalEntityType, shape, color, comment, loc }) => ({
      key,
      title,
      legalEntityType,
      shape,
      color,
      comment,
      // Left out, not undefined: a node without a position is one the layout places.
      ...(loc === undefined ? {} : { loc }),
    })),
    links: stored.links.map(({ key, from, to, category, ownership }) => ({
      key,
      from,
      to,
      category,
      ...(ownership === undefined ? {} : { ownership }),
    })),
  };
}

/**
 * The diagrams of the database, through the backend (see backend/ and the
 * README). The addresses start with /api: while developing, the dev server
 * passes them on to the backend (proxy.conf.json).
 */
@Injectable({ providedIn: 'root' })
export class DiagramsApi {
  private readonly http = inject(HttpClient);

  /**
   * One page of the list of diagrams; `page` counts from 1. With a `search`
   * text, the list and its totals are of the diagrams that have it in their name.
   */
  list(page: number, search = ''): Promise<DiagramListPage> {
    const params: Record<string, string | number> = search ? { page, search } : { page };
    return firstValueFrom(this.http.get<DiagramListPage>('/api/diagrams', { params }));
  }

  /** One diagram with its settings, nodes and lines. Fails when there is none with this id. */
  read(id: string): Promise<StoredDiagram> {
    return firstValueFrom(this.http.get<StoredDiagram>(`/api/diagrams/${encodeURIComponent(id)}`));
  }
}
