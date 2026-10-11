/**
 * jsdom has no canvas. GoJS only needs one to draw and to measure text, so for
 * tests a stand-in is enough: every drawing call does nothing, and text is
 * measured as a fixed width per character.
 */
const CHARACTER_WIDTH = 6;

function createContextStub(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {
    canvas,
    font: '10px sans-serif',
    measureText: (text: string) => ({ width: text.length * CHARACTER_WIDTH }),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => null,
    getLineDash: () => [],
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };
  return new Proxy(state, {
    // Anything not listed above is a drawing call (or a style property being read).
    get: (target, name) => (name in target ? target[name] : () => undefined),
    set: (target, name, value) => {
      target[name] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** A path that accepts every drawing instruction and keeps none of them. */
/* eslint-disable @typescript-eslint/no-empty-function -- doing nothing is the point of this class */
class Path2DStub {
  addPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  arc(): void {}
  arcTo(): void {}
  ellipse(): void {}
  rect(): void {}
  roundRect(): void {}
  closePath(): void {}
}
/* eslint-enable @typescript-eslint/no-empty-function */

/** Makes every canvas hand out the stand-in context. Call once before creating a diagram. */
export function installCanvasStub(): void {
  (globalThis as { Path2D?: unknown }).Path2D ??= Path2DStub;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    return createContextStub(this);
  } as unknown as HTMLCanvasElement['getContext'];
}
