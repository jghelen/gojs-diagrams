import { openInNewTab, readFlag, writeFlag } from './browser';

describe('readFlag and writeFlag', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('give the fallback while nothing was remembered', () => {
    expect(readFlag('unknown', true)).toBe(true);
    expect(readFlag('unknown', false)).toBe(false);
  });

  it('remember a setting', () => {
    writeFlag('panel-open', false);
    expect(readFlag('panel-open', true)).toBe(false);
    writeFlag('panel-open', true);
    expect(readFlag('panel-open', false)).toBe(true);
  });

  it('carry on when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => writeFlag('panel-open', false)).not.toThrow();
    expect(readFlag('panel-open', true)).toBe(true);
  });
});

describe('openInNewTab', () => {
  it('follows a link that opens in a new tab, without handing the new page a way back', () => {
    const opened: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      opened.push(this);
    });
    openInNewTab('/batches/new?nodeId=7');
    expect(opened).toHaveLength(1);
    expect(opened[0].getAttribute('href')).toBe('/batches/new?nodeId=7');
    expect(opened[0].target).toBe('_blank');
    expect(opened[0].rel).toBe('noopener');
    click.mockRestore();
  });
});
