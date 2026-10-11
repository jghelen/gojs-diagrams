import { LinkData, NODE_COUNTS, NodeData, createLinks, createNodes } from './node-data';
import { createOrgChart } from './sample-data';

/** Something the diagram can be loaded with. */
export interface Dataset {
  id: string;
  label: string;
  create: () => { nodes: NodeData[]; links: LinkData[] };
}

export const DATASETS: readonly Dataset[] = [
  { id: 'company', label: 'Sample company', create: createOrgChart },
  ...NODE_COUNTS.map((count) => ({
    id: String(count),
    label: `${count} random nodes`,
    create: () => ({ nodes: createNodes(count), links: createLinks(count) }),
  })),
];

export const DEFAULT_DATASET = '200';

export function findDataset(id: string): Dataset {
  return DATASETS.find((dataset) => dataset.id === id) ?? DATASETS[0];
}
