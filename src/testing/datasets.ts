import { LinkData, NodeData } from '../app/diagram/node-data';
import { createLinks, createNodes } from './generated-funds';
import { createFundStructure } from './sample-data';

// The diagrams the tests open: a sample fund structure, generated ones of
// several sizes, and an empty one. They are also the sample diagrams of the
// database (backend/db/003_sample_diagrams.sql).

/** How many funds the generated diagrams have. */
export const NODE_COUNTS: readonly number[] = [30, 100, 200, 500, 1000, 2000];
/** The diagram most tests start with: 30 generated funds. */
export const DEFAULT_DATASET = '30';
/** The id of the dataset with nothing in it. */
export const BLANK_DATASET = 'blank';

/** A diagram for a test to open. */
export interface Dataset {
  id: string;
  label: string;
  create: () => { nodes: NodeData[]; links: LinkData[] };
}

export const DATASETS: readonly Dataset[] = [
  { id: 'fund-structure', label: 'Sample fund structure', create: createFundStructure },
  ...NODE_COUNTS.map((count) => ({
    id: String(count),
    label: `${count} generated funds`,
    create: () => ({ nodes: createNodes(count), links: createLinks(count) }),
  })),
  { id: BLANK_DATASET, label: 'Empty diagram', create: () => ({ nodes: [], links: [] }) },
];

export function findDataset(id: string): Dataset {
  return DATASETS.find((dataset) => dataset.id === id) ?? DATASETS[0];
}
