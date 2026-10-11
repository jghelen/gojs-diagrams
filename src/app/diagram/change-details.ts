import * as go from 'gojs/release/go';

/**
 * `data`: a change to the diagram's data, which is what an action sets out to do.
 * `drawing`: a change GoJS made to what is on screen as a result. GoJS records
 * those as well, so that an undo restores the picture and not only the data.
 */
export type ChangeKind = 'data' | 'drawing';

export interface ChangeRow {
  kind: ChangeKind;
  /** The fund, relationship or part of the diagram that changed. */
  subject: string;
  /** What about it changed. */
  property: string;
  before: string;
  after: string;
}

export interface ChangeGroup {
  kind: ChangeKind;
  property: string;
  count: number;
}

export interface ChangeDetails {
  total: number;
  data: number;
  drawing: number;
  /** How many changes there were to each property: data first, then the most frequent. */
  byProperty: ChangeGroup[];
  /** The first changes, in the order in which they were made. */
  rows: ChangeRow[];
}

/** How many changes are listed one by one; an action on a big diagram makes thousands. */
export const MAX_CHANGE_ROWS = 200;

const MAX_VALUE_LENGTH = 60;

/** Names for the fields of the data, where the field name itself says too little. */
const DATA_LABELS: Record<string, string> = {
  subtitle: 'fund type',
  loc: 'position',
  layoutType: 'layout',
  linkType: 'line type',
};

function clip(text: string): string {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text;
}

/** Numbers with at most one decimal, also inside texts such as "Size(74.4166,NaN)". */
function roundNumbers(text: string): string {
  return text.replace(/-?\d+\.\d+/g, (number) => String(Math.round(Number(number) * 10) / 10));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

function isLinkData(value: unknown): value is { from: unknown; to: unknown } {
  return isRecord(value) && 'from' in value && 'to' in value;
}

/** A value before or after a change, short enough for one table cell. */
function showValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '(empty)' : clip(value);
  if (typeof value === 'number') return roundNumbers(String(value));
  if (typeof value === 'boolean') return String(value);
  if (value instanceof go.List) return `${value.count} points`;
  if (value instanceof go.Layout) return 'a layout';
  if (value instanceof go.Brush) return value.color || 'a gradient';
  if (value instanceof go.GraphObject) return elementName(value);
  if (isRecord(value)) {
    // GoJS keeps its own bookkeeping on data objects under "__" names.
    return clip(
      JSON.stringify(value, (name, v: unknown) => (name.startsWith('__') ? undefined : v)),
    );
  }
  return clip(roundNumbers(String(value)));
}

/** The fund or relationship that a data object stands for. */
function dataSubject(data: unknown, model: go.Model | null): string {
  if (model && data === model.modelData) return 'Diagram settings';
  if (isLinkData(data)) return `Relationship ${String(data.from)} → ${String(data.to)}`;
  if (isRecord(data) && 'key' in data) {
    return `Fund "${String(data['title'] ?? '')}" (node ${String(data['key'])})`;
  }
  return 'Diagram';
}

/** The kind of a piece of a node or line, with its name where it has one. */
function elementName(element: go.GraphObject): string {
  const kind =
    element instanceof go.TextBlock
      ? 'Text'
      : element instanceof go.Shape
        ? 'Shape'
        : element instanceof go.Link
          ? 'Line'
          : element instanceof go.Node
            ? 'Node'
            : element instanceof go.Panel
              ? 'Panel'
              : 'Element';
  return element.name ? `${kind} ${element.name}` : kind;
}

function describe(change: go.ChangedEvent): ChangeRow {
  const { model, object, oldValue, newValue } = change;
  // GoJS also allows a function here; the changes it records itself always carry a name.
  const propertyName = typeof change.propertyName === 'string' ? change.propertyName : '';
  if (model) {
    if (change.change === go.ChangeType.Insert) {
      return {
        kind: 'data',
        subject: dataSubject(newValue, model),
        property: 'added',
        before: '—',
        after: showValue(newValue),
      };
    }
    if (change.change === go.ChangeType.Remove) {
      return {
        kind: 'data',
        subject: dataSubject(oldValue, model),
        property: 'removed',
        before: showValue(oldValue),
        after: '—',
      };
    }
    return {
      kind: 'data',
      subject: dataSubject(object, model),
      property: DATA_LABELS[propertyName] ?? propertyName,
      before: showValue(oldValue),
      after: showValue(newValue),
    };
  }

  // Everything else is a change to what is drawn.
  let subject = 'Diagram';
  let property = propertyName;
  if (object instanceof go.GraphObject) {
    const part = object.part;
    subject = part?.data ? dataSubject(part.data, null) : part ? elementName(part) : 'Diagram';
    // "Text: stroke" for a piece of the node, plain "location" for the node itself.
    if (object !== part) property = `${elementName(object)}: ${propertyName}`;
  }
  return {
    kind: 'drawing',
    subject,
    property,
    before: showValue(oldValue),
    after: showValue(newValue),
  };
}

/**
 * What the given transactions changed: totals, a count per property, and the
 * first `limit` changes one by one.
 */
export function describeChanges(
  transactions: Iterable<go.Transaction>,
  limit = MAX_CHANGE_ROWS,
): ChangeDetails {
  const rows: ChangeRow[] = [];
  const groups = new Map<string, ChangeGroup>();
  let data = 0;
  let drawing = 0;
  for (const transaction of transactions) {
    transaction.changes.each((change) => {
      const row = describe(change);
      if (row.kind === 'data') data++;
      else drawing++;
      const key = `${row.kind}|${row.property}`;
      const group = groups.get(key);
      if (group) group.count++;
      else groups.set(key, { kind: row.kind, property: row.property, count: 1 });
      if (rows.length < limit) rows.push(row);
    });
  }
  const byProperty = [...groups.values()].sort((a, b) =>
    a.kind === b.kind ? b.count - a.count : a.kind === 'data' ? -1 : 1,
  );
  return { total: data + drawing, data, drawing, byProperty, rows };
}
