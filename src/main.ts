import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Ten lines of stack are too few to see where an error in a deep call chain began.
(Error as { stackTraceLimit?: number }).stackTraceLimit = 100;

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
