// A diagram as the backend hands it out. The names are the ones the Angular app
// uses for the same things (ModelData, NodeData and LinkData in src/app/diagram),
// so that `nodes`, `links` and `settings` can be given to the app's createModel()
// as they are.

export type LayoutType = 'top-bottom' | 'bottom-top' | 'circle' | 'layered' | 'force' | 'grid';
export type LinkType = 'avoid' | 'orthogonal' | 'straight' | 'curved';
/**
 * 'manual' is an artificial link: a dashed line that the user drew in this one
 * diagram. The other two are relationships, which are the same in every diagram.
 */
export type LinkKind = 'hierarchy' | 'relation' | 'manual';
export type FieldDataType = 'text' | 'number' | 'date' | 'boolean';

export interface DiagramSettings {
  name: string;
  description: string;
  layoutType: LayoutType;
  linkType: LinkType;
  cardsExpanded: boolean;
  /** The built-in field shown under the names of the nodes, or null. */
  subtitleField: 'legalEntityType' | null;
  /** Or the user-defined field shown there. At most one of the two is set. */
  subtitleUserDefinedFieldId: number | null;
}

/** A user-defined field that a legal entity has, with its value there. */
export interface NodeField {
  id: number;
  name: string;
  dataType: FieldDataType;
  isOptional: boolean;
  /**
   * Text, a number, a date as "2019-03-01", or true/false, according to
   * `dataType`. Null when the entity has the field and it is empty.
   */
  value: string | number | boolean | null;
}

export interface DiagramNode {
  /** The id of the legal entity. */
  key: number;
  title: string;
  legalEntityType: string;
  shape: string;
  color: string;
  comment: string;
  /** "x y" of the top left corner. Left out for a node that has not been placed yet. */
  loc?: string;
  /** The user-defined fields this legal entity has, by name. Empty when it has none. */
  fields: NodeField[];
}

export interface DiagramLink {
  key: number;
  /** The keys of the two nodes: the fund that invests, and the fund it invests in. */
  from: number;
  to: number;
  category: LinkKind;
  /** How much of `to` is owned by `from`, in percent. Left out when that is not known. */
  ownership?: number;
}

export interface Diagram {
  id: number;
  /** Goes up with every save. */
  version: number;
  settings: DiagramSettings;
  nodes: DiagramNode[];
  links: DiagramLink[];
}

/** A diagram as a row of the list of all diagrams. */
export interface DiagramSummary {
  id: number;
  name: string;
  /** Moments in time, as "2026-10-12T17:23:58.700Z". */
  createdAt: string;
  updatedAt: string;
}

/** One page of the list of all diagrams. */
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
