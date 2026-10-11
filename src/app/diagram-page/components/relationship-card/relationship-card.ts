import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DiagramActions } from '../../diagram-actions';
import { LinkInfoCard } from '../../link-info-card/link-info-card';
import { OperationRunner } from '../../operation-runner/operation-runner';

/**
 * The card with the data of one relationship, shown on the canvas beside the
 * info icon that was clicked. Which relationship it is about and where it
 * stands is kept by the LinkInfoCard service.
 */
@Component({
  selector: 'app-relationship-card',
  templateUrl: './relationship-card.html',
  styleUrl: './relationship-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Escape puts the card away, wherever the keyboard focus is.
  host: { '(document:keydown.escape)': 'closeLinkInfo()' },
})
export class RelationshipCard {
  private readonly actions = inject(DiagramActions);
  private readonly linkCard = inject(LinkInfoCard);

  protected readonly busy = inject(OperationRunner).busy;
  /** The relationship whose card is open; null when none is. */
  protected readonly linkInfo = this.linkCard.info;

  protected closeLinkInfo(): void {
    this.linkCard.close();
  }

  /** Removes the relationship whose card is open. */
  protected removeInfoLink(): Promise<void> {
    const link = this.linkInfo()?.link;
    this.closeLinkInfo();
    return this.actions.removeLinks(() => (link ? [link] : []));
  }
}
