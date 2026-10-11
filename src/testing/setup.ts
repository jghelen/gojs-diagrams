import { installCanvasStub } from './canvas-stub';

// Runs before every spec file is loaded: GoJS asks for a canvas context as soon
// as it measures its first text, so the stand-in has to be in place before then.
installCanvasStub();

// jsdom draws nothing, so there are no frames. The app treats a hidden page as
// "nothing will be painted" and does not wait for one.
Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
globalThis.requestAnimationFrame ??= (callback: FrameRequestCallback) =>
  setTimeout(() => callback(performance.now()), 0) as unknown as number;

// Older jsdom versions have <dialog> without the methods that open and close it.
const dialog = HTMLDialogElement.prototype;
dialog.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
dialog.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};
