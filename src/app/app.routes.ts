import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { DiagramList } from './diagram-list/diagram-list';
import { NewBatch } from './new-batch/new-batch';
import { DiagramPage } from './diagram-page/diagram-page';

/**
 * The editor has two addresses: "/" for the data of the Data dropdown, and
 * "/diagrams/<id>" for a diagram of the database. They are one route, so that
 * going from one address to the other keeps the page and the diagram in it:
 * picking sample data while a stored diagram is shown only changes the address.
 */
export function editorAddress(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 0) return { consumed: [] };
  if (segments.length === 2 && segments[0].path === 'diagrams') {
    return { consumed: segments, posParams: { id: segments[1] } };
  }
  return null;
}

export const routes: Routes = [
  { path: 'diagrams', component: DiagramList },
  {
    matcher: editorAddress,
    component: DiagramPage,
    // Nothing is saved yet, so leaving a diagram with changes loses them: ask first.
    canDeactivate: [(page: DiagramPage) => page.mayLeave()],
  },
  { path: 'batches/new', component: NewBatch },
  { path: '**', redirectTo: '' },
];
