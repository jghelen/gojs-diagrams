import * as go from 'gojs/release/go';

/** A node shape as it is offered for picking: its name and a small outline to draw. */
export interface ShapeTile {
  figure: go.FigureName;
  label: string;
  /** SVG path of the outline in a 44 x 26 box. */
  path: string;
}

export const SHAPE_TILES: readonly ShapeTile[] = [
  { figure: go.Figures.Rectangle, label: 'Square', path: 'M1 1H43V25H1Z' },
  {
    figure: go.Figures.RoundedRectangle,
    label: 'Rounded',
    path: 'M7 1H37Q43 1 43 7V19Q43 25 37 25H7Q1 25 1 19V7Q1 1 7 1Z',
  },
  {
    figure: go.Figures.Ellipse,
    label: 'Ellipse',
    path: 'M1 13A21 12 0 1 0 43 13A21 12 0 1 0 1 13Z',
  },
  { figure: go.Figures.Diamond, label: 'Diamond', path: 'M22 1L43 13L22 25L1 13Z' },
  {
    figure: go.Figures.Capsule,
    label: 'Capsule',
    path: 'M13 1H31A12 12 0 0 1 31 25H13A12 12 0 0 1 13 1Z',
  },
  {
    figure: go.Figures.RoundedTopRectangle,
    label: 'Rounded top',
    path: 'M1 25V7Q1 1 7 1H37Q43 1 43 7V25Z',
  },
];
