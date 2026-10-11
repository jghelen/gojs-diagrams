import * as go from 'gojs/release/go';
import { IMAGE_MAX_SIDE, IMAGE_SCALE } from '../diagram/constants';
import { picturedParts } from '../diagram/diagram-factory';
import { downloadFileName } from '../diagram/file-name';

/**
 * How the diagram is turned into a picture: all of it, not just what is on
 * screen, on white, sharp, and without the gold outlines of a selection.
 * Whoever asks for a picture ends a highlight first, so nothing is dimmed in it.
 */
function pictureOptions(diagram: go.Diagram): go.ImageRendererOptions {
  const bounds = diagram.documentBounds;
  const longest = Math.max(bounds.width, bounds.height, 1);
  return {
    background: '#ffffff',
    parts: picturedParts(diagram),
    // The info icons, percentages and cards live in temporary layers.
    showTemporary: true,
    scale: Math.min(IMAGE_SCALE, IMAGE_MAX_SIDE / longest),
    maxSize: new go.Size(IMAGE_MAX_SIDE + 100, IMAGE_MAX_SIDE + 100),
  };
}

/** Downloads a picture of the whole diagram as a PNG file named after the diagram. */
export function downloadDiagramPng(diagram: go.Diagram, diagramName: string): void {
  diagram.makeImageData({
    ...pictureOptions(diagram),
    returnType: 'blob',
    callback: (blob: Blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = downloadFileName(diagramName, 'png');
      link.click();
      URL.revokeObjectURL(link.href);
    },
  });
}

/** A picture of the whole diagram as an address that an <img> can show, for printing. */
export function diagramPicture(diagram: go.Diagram): string {
  return diagram.makeImageData(pictureOptions(diagram)) as string;
}
