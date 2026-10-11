import { LinkData, NodeData, createLinks, createNodes } from './node-data';
import { createFundStructure } from './sample-data';
import { BLANK_DATASET, NODE_COUNTS } from './constants';

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
  { id: BLANK_DATASET, label: 'Empty diagram', create: () => ({ nodes: [], links: [] }) },
];

export function findDataset(id: string): Dataset {
  return DATASETS.find((dataset) => dataset.id === id) ?? DATASETS[0];
}
