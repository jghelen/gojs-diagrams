import { Routes } from '@angular/router';
import { NewBatch } from './new-batch/new-batch';
import { PerfDiagram } from './perf-diagram/perf-diagram';

export const routes: Routes = [
  { path: '', component: PerfDiagram },
  { path: 'batches/new', component: NewBatch },
  { path: '**', redirectTo: '' },
];
