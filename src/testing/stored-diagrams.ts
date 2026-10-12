import { HttpTestingController } from '@angular/common/http/testing';
import { StoredDiagram } from '../app/api/diagrams-api';
import { NEW_DIAGRAM_ID } from '../app/diagram-list/diagram-list';
import { DEFAULT_LAYOUT, DEFAULT_LINK_TYPE } from '../app/diagram/constants';
import { BLANK_DATASET, findDataset } from './datasets';

// The editor shows diagrams of the database only. For a test, the test datasets
// stand in for the database: a dataset is "stored" under its own id, so that
// the address /diagrams/100 shows the 100 generated funds.

/** The id in the address that shows this dataset: its own, or "new" for the empty one. */
export function addressIdOf(datasetId: string): string {
  return datasetId === BLANK_DATASET ? NEW_DIAGRAM_ID : datasetId;
}

/**
 * A test dataset as the backend would hand it out: named after the dataset, in
 * the default layout and line type, its nodes without positions.
 */
export function storedDataset(
  datasetId: string,
  settings: Partial<StoredDiagram['settings']> = {},
): StoredDiagram {
  const dataset = findDataset(datasetId);
  const { nodes, links } = dataset.create();
  return {
    id: Number(datasetId) || 1,
    version: 1,
    settings: {
      name: dataset.label,
      description: '',
      layoutType: DEFAULT_LAYOUT,
      linkType: DEFAULT_LINK_TYPE,
      cardsExpanded: false,
      subtitleField: null,
      subtitleUserDefinedFieldId: null,
      ...settings,
    },
    nodes: nodes.map((node) => ({ ...node, fields: [] })),
    links,
  };
}

/** Answers the request that the editor has sent for this dataset. */
export function answerDataset(
  backend: HttpTestingController,
  datasetId: string,
  stored = storedDataset(datasetId),
): void {
  backend.expectOne(`/api/diagrams/${addressIdOf(datasetId)}`).flush(stored);
}
