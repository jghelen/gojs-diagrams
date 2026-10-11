import { BLANK_DATASET, DATASETS, DEFAULT_DATASET, findDataset } from './datasets';

describe('datasets', () => {
  it('offers the sample fund structure and the generated sizes', () => {
    expect(DATASETS.map((dataset) => dataset.id)).toEqual([
      'fund-structure',
      '30',
      '100',
      '200',
      '500',
      '1000',
      '2000',
      'blank',
    ]);
  });

  it('opens with the 30-node diagram', () => {
    expect(DEFAULT_DATASET).toBe('30');
    expect(findDataset(DEFAULT_DATASET).create().nodes).toHaveLength(30);
  });

  it('labels every dataset with data as funds', () => {
    for (const dataset of DATASETS) {
      if (dataset.id === BLANK_DATASET) continue;
      expect(dataset.label.toLowerCase()).toContain('fund');
    }
  });

  it('has an empty dataset for starting from scratch', () => {
    expect(findDataset(BLANK_DATASET).create()).toEqual({ nodes: [], links: [] });
  });

  it('creates as many nodes as the dataset says', () => {
    expect(findDataset('100').create().nodes).toHaveLength(100);
    expect(findDataset('fund-structure').create().nodes).toHaveLength(24);
  });

  it('falls back to the first dataset for an unknown id', () => {
    expect(findDataset('nope')).toBe(DATASETS[0]);
  });

  it('creates new data on every call, so that a reset starts clean', () => {
    const dataset = findDataset('30');
    expect(dataset.create().nodes).not.toBe(dataset.create().nodes);
  });
});
