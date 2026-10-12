import { ChangeDetectionStrategy, Component, VERSION } from '@angular/core';
import * as go from 'gojs/release/go';

/** The line at the bottom of the page: which versions of Angular and GoJS the app is built with. */
@Component({
  selector: 'app-page-footer',
  templateUrl: './page-footer.html',
  styleUrl: './page-footer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageFooter {
  protected readonly angularVersion = VERSION.full;
  protected readonly gojsVersion = go.Diagram.version;
}
