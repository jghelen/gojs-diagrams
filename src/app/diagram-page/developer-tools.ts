import { Injectable, signal } from '@angular/core';
import { DEVELOPER_TOOLS_KEY } from '../diagram/constants';
import { readFlag, writeFlag } from './browser';

/**
 * Whether the developer tools are on screen: the benchmark statistics below the
 * canvas, and the history numbers and random edits in the side panel.
 *
 * They measure how fast the diagram is; they are not needed to edit one. So
 * they are hidden until someone asks for them with the switch in the top bar,
 * and the browser remembers that choice.
 *
 * Hiding them only takes them off the screen: operations are timed and listed
 * all the same, so the statistics are complete when they are shown again.
 */
@Injectable()
export class DeveloperTools {
  readonly shown = signal(readFlag(DEVELOPER_TOOLS_KEY, false));

  toggle(): void {
    this.shown.update((shown) => !shown);
    writeFlag(DEVELOPER_TOOLS_KEY, this.shown());
  }
}
