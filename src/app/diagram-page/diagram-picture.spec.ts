import * as go from 'gojs/release/go';
import { createTestDiagram, linksOf, nodesOf } from '../../testing/diagram-harness';
import { diagramPicture, downloadDiagramPng } from './diagram-picture';

describe('pictures of the diagram', () => {
  /** Asks for a picture and gives back what GoJS was asked to draw. */
  const optionsFor = (diagram: go.Diagram): go.ImageRendererOptions => {
    const draw = vi.spyOn(diagram, 'makeImageData').mockReturnValue('data:image/png;base64,');
    diagramPicture(diagram);
    const options = draw.mock.calls[0][0] as go.ImageRendererOptions;
    draw.mockRestore();
    return options;
  };

  afterEach(() => vi.restoreAllMocks());

  it('show the whole diagram on white, at twice its size, with what lives in temporary layers', () => {
    const { diagram } = createTestDiagram();
    const options = optionsFor(diagram);
    expect(options.background).toBe('#ffffff');
    expect(options.scale).toBe(2);
    expect(options.showTemporary).toBe(true);
    const drawn = new Set<go.Part>();
    (options.parts as go.List<go.Part>).each((part) => drawn.add(part));
    for (const node of nodesOf(diagram)) expect(drawn.has(node)).toBe(true);
    for (const link of linksOf(diagram)) expect(drawn.has(link)).toBe(false);
  });

  it('draw a very large diagram smaller, so that no side is longer than 10,000 pixels', () => {
    // 200 funds on a circle make a diagram far wider than 5,000 units.
    const { diagram } = createTestDiagram({ count: 200, layout: 'circle', linkType: 'straight' });
    const longest = Math.max(diagram.documentBounds.width, diagram.documentBounds.height);
    expect(longest).toBeGreaterThan(5000);
    const options = optionsFor(diagram);
    expect(options.scale).toBeLessThan(2);
    expect(options.scale! * longest).toBeCloseTo(10_000, 0);
  });

  it('are given as an address that an image can show, for printing', () => {
    const { diagram } = createTestDiagram();
    vi.spyOn(diagram, 'makeImageData').mockReturnValue('data:image/png;base64,AAAA');
    expect(diagramPicture(diagram)).toBe('data:image/png;base64,AAAA');
  });

  it('are downloaded as a PNG file named after the diagram', () => {
    const { diagram } = createTestDiagram();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    URL.createObjectURL ??= () => 'blob:test';
    URL.revokeObjectURL ??= () => undefined;
    const draw = vi
      .spyOn(diagram, 'makeImageData')
      .mockImplementation(((options: { callback: (blob: Blob) => void }) =>
        options.callback(new Blob(['png']))) as never);

    downloadDiagramPng(diagram, 'Funds: Q3/2026');
    expect((draw.mock.calls[0][0] as go.ImageRendererOptions).returnType).toBe('blob');
    expect(downloads).toEqual(['Funds- Q3-2026.png']);
  });
});
