import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { COLORS } from '../../diagram/constants';
import { LinkData, NodeData } from '../../diagram/node-data';
import { DiagramActions } from '../diagram-actions';

/** What the delete confirmation dialog is asking about. */
export interface DeleteRequest {
  /** Keys of the nodes to delete. */
  keys: number[];
  /** Relationships that were selected along with them and are removed too. */
  links: LinkData[];
  /** Title of the node when there is exactly one. */
  title: string | null;
  /** How many relationships touch the nodes and are removed with them. */
  attached: number;
}

/**
 * The three dialogs that the icons of a node open: its color, its comment, and
 * the question before it is deleted. The page opens them; what the user then
 * picks is carried out from here, as one undo step each.
 */
@Component({
  selector: 'app-node-dialogs',
  templateUrl: './node-dialogs.html',
  styleUrl: './node-dialogs.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeDialogs {
  private readonly actions = inject(DiagramActions);

  protected readonly colors = COLORS;
  /** The node whose color is being chosen. */
  protected readonly colorTarget = signal<NodeData | null>(null);
  /** The node whose comment is being edited. */
  protected readonly commentTarget = signal<NodeData | null>(null);
  /** What is currently typed into the comment dialog; Save needs it to hold some text. */
  protected readonly commentDraft = signal('');
  protected readonly deleteRequest = signal<DeleteRequest | null>(null);

  private readonly colorDialog = viewChild.required<ElementRef<HTMLDialogElement>>('colorDialog');
  private readonly commentDialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('commentDialog');
  private readonly deleteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');

  // ----- Color -----

  /** Opens the color dialog for one node. */
  showColorPicker(node: NodeData): void {
    this.colorTarget.set(node);
    this.colorDialog().nativeElement.showModal();
  }

  protected closeColorPicker(): void {
    this.colorDialog().nativeElement.close();
  }

  /** Gives the node of the color dialog its new color and closes the dialog. */
  protected pickColor(color: string): Promise<void> {
    const node = this.colorTarget();
    this.closeColorPicker();
    return this.actions.setField(() => (node ? [node] : []), 'color', color);
  }

  // ----- Comment -----

  /** Opens the comment dialog for one node. */
  showComment(node: NodeData): void {
    this.commentDraft.set(node.comment);
    this.commentTarget.set(node);
    this.commentDialog().nativeElement.showModal();
  }

  protected closeComment(): void {
    this.commentDialog().nativeElement.close();
  }

  /** Stores the comment of the node of the comment dialog; an empty text removes it. */
  protected saveComment(text: string): Promise<void> {
    const node = this.commentTarget();
    this.closeComment();
    return this.actions.setField(() => (node ? [node] : []), 'comment', text.trim());
  }

  // ----- Delete -----

  /** Opens the dialog that asks before these nodes are deleted. */
  confirmDeletion(request: DeleteRequest): void {
    this.deleteRequest.set(request);
    this.deleteDialog().nativeElement.showModal();
  }

  protected cancelDelete(): void {
    this.deleteDialog().nativeElement.close();
  }

  /** Deletes what the dialog asked about. */
  protected confirmDelete(): Promise<void> {
    const request = this.deleteRequest();
    this.cancelDelete();
    return this.actions.deleteNodes(request?.keys ?? [], request?.links ?? []);
  }
}
