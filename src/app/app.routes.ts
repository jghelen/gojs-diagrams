import { Routes } from '@angular/router';
import { NewBatch } from './new-batch/new-batch';
import { DiagramPage } from './diagram-page/diagram-page';

export const routes: Routes = [
  { path: '', component: DiagramPage },
  { path: 'batches/new', component: NewBatch },
  { path: '**', redirectTo: '' },
];
