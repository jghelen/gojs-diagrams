import { Injectable, signal } from '@angular/core';
import * as go from 'gojs/release/go';
import { NodeModel } from '../diagram/diagram-factory';
import { LinkData, NodeData, formatOwnership } from '../diagram/node-data';

/** What the card of a relationship shows, and where it stands. */
export interface LinkInfo {
  link: LinkData;
  from: NodeData | null;
  to: NodeData | null;
  /** The ownership percentage as text, or null when there is no data. */
  ownership: string | null;
  /** Where the card stands, in pixels from the top left of the canvas. */
  left: number;
  top: number;
}

/**
 * The size of the card. Its width is set in the style sheet to the same number;
 * the height is what the card comes to with its four lines, and is only used to
 * keep the card inside the canvas.
 */
const CARD_WIDTH = 270;
const CARD_HEIGHT = 178;
/** Room between the info icon and its card, and between the card and the edge of the canvas. */
const CARD_GAP = 14;
const CARD_MARGIN = 8;

/**
 * The card that a click on the info icon of a relationship opens: which
 * relationship it is about, and where on the canvas it stands.
 *
 * The card is part of the page, not of the diagram, so it keeps its size
 * whatever the zoom. This service works out its place beside the icon and
 * moves it along when the diagram is scrolled or zoomed.
 */
@Injectable()
export class LinkInfoCard {
  /** The relationship whose card is open; null when none is. */
  readonly info = signal<LinkInfo | null>(null);

  private diagram!: go.Diagram;

  connect(diagram: go.Diagram): void {
    this.diagram = diagram;
  }

  private get model(): NodeModel {
    return this.diagram.model as NodeModel;
  }

  /** Opens the card of a relationship. A second call for the same one puts the card away again. */
  show(link: LinkData): void {
    if (this.info()?.link === link) return this.close();
    const place = this.placeFor(link);
    if (!place) return;
    this.info.set({
      link,
      from: this.model.findNodeDataForKey(link.from),
      to: this.model.findNodeDataForKey(link.to),
      ownership: link.ownership === undefined ? null : formatOwnership(link.ownership),
      ...place,
    });
  }

  close(): void {
    this.info.set(null);
  }

  /**
   * Keeps an open card with its info icon after the diagram was scrolled, zoomed
   * or changed, and puts it away when its relationship is gone.
   */
  follow(): void {
    const info = this.info();
    if (!info) return;
    const place = this.model.containsLinkData(info.link) ? this.placeFor(info.link) : null;
    if (!place) return this.close();
    if (place.left !== info.left || place.top !== info.top) this.info.set({ ...info, ...place });
  }

  /**
   * Where the card of this relationship goes: beside its info icon, to the right
   * where there is room and to the left otherwise, and never outside the canvas.
   * Null when the relationship is not in the diagram.
   */
  private placeFor(link: LinkData): { left: number; top: number } | null {
    const line = this.diagram.findLinkForData(link);
    if (!line) return null;
    const icon = this.diagram.transformDocToView(line.midPoint);
    const canvasWidth = this.diagram.viewportBounds.width * this.diagram.scale;
    const canvasHeight = this.diagram.viewportBounds.height * this.diagram.scale;
    const within = (value: number, size: number, room: number) =>
      Math.max(CARD_MARGIN, Math.min(value, room - size - CARD_MARGIN));

    const fitsOnTheRight = icon.x + CARD_GAP + CARD_WIDTH <= canvasWidth - CARD_MARGIN;
    const left = fitsOnTheRight ? icon.x + CARD_GAP : icon.x - CARD_GAP - CARD_WIDTH;
    return {
      left: Math.round(within(left, CARD_WIDTH, canvasWidth)),
      top: Math.round(within(icon.y - CARD_HEIGHT / 2, CARD_HEIGHT, canvasHeight)),
    };
  }
}
