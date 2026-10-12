import { Routes } from '@angular/router';
import { DiagramList } from './diagram-list/diagram-list';
import { NewBatch } from './new-batch/new-batch';
import { DiagramPage } from './diagram-page/diagram-page';

export const routes: Routes = [
  // The app starts with the list of diagrams: every diagram comes from the database.
  { path: '', pathMatch: 'full', redirectTo: 'diagrams' },
  { path: 'diagrams', component: DiagramList },
  {
    // The editor, for the diagram with this id; /diagrams/new starts a new one.
    // From one diagram to another the page stays and opens the other diagram.
    path: 'diagrams/:id',
    component: DiagramPage,
    // Nothing is saved yet, so leaving a diagram with changes loses them: ask first.
    canDeactivate: [(page: DiagramPage) => page.mayLeave()],
  },
  { path: 'batches/new', component: NewBatch },
  { path: '**', redirectTo: 'diagrams' },
];
