import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The address that the batch icon of a node opens.
 * Change this one function to point the icon at a different page or application.
 */
export function newBatchUrl(nodeId: number): string {
  return `/batches/new?nodeId=${nodeId}`;
}

/** Placeholder for the page where a batch is added to a node. */
@Component({
  selector: 'app-new-batch',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Add batch</h1>
      @if (nodeId(); as id) {
        <p>
          Node id: <strong>{{ id }}</strong>
        </p>
      } @else {
        <p>No node id was given in the address.</p>
      }
      <p class="note">This is a placeholder page. The form for a new batch goes here.</p>
      <a routerLink="/diagrams">All diagrams</a>
    </main>
  `,
  styles: `
    main {
      max-width: 480px;
      margin: 48px auto;
      padding: 0 16px;
    }

    h1 {
      font-size: 20px;
    }

    .note {
      color: var(--muted);
    }
  `,
})
export class NewBatch {
  /** Bound from the `nodeId` query parameter. */
  readonly nodeId = input<string>();
}
