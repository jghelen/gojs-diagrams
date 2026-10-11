import { LinkData, NODE_COUNTS, NodeData, createLinks, createNodes } from './node-data';
import { createFundStructure } from './sample-data';

/** Something the diagram can be loaded with. */
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
  { id: 'blank', label: 'Empty diagram', create: () => ({ nodes: [], links: [] }) },
];

/** The dataset with nothing in it, for building a diagram from scratch. */
export const BLANK_DATASET = 'blank';

export const DEFAULT_DATASET = '30';

export function findDataset(id: string): Dataset {
  return DATASETS.find((dataset) => dataset.id === id) ?? DATASETS[0];
}
