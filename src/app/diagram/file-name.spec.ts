import { downloadFileName } from './file-name';

describe('downloadFileName', () => {
  it('keeps an ordinary name as it is', () => {
    expect(downloadFileName('Sample fund structure', 'png')).toBe('Sample fund structure.png');
    expect(downloadFileName('Fund_2026 (draft) v1.2', 'png')).toBe('Fund_2026 (draft) v1.2.png');
  });

  it('keeps letters of other alphabets', () => {
    expect(downloadFileName('Šema fondova Čačak', 'png')).toBe('Šema fondova Čačak.png');
    expect(downloadFileName('Структура фондова', 'png')).toBe('Структура фондова.png');
  });

  it('replaces characters a file name cannot contain with a dash', () => {
    expect(downloadFileName('Q3/2026: "Alpha" <draft>?', 'png')).toBe(
      'Q3-2026- -Alpha- -draft.png',
    );
    expect(downloadFileName('a\\b|c*d', 'png')).toBe('a-b-c-d.png');
  });

  it('replaces other special characters as well', () => {
    expect(downloadFileName('Funds & co. #1 @ 50%', 'png')).toBe('Funds - co. -1 - 50.png');
    expect(downloadFileName('line\nbreak\ttab', 'png')).toBe('line-break-tab.png');
  });

  it('uses one dash for a run of special characters', () => {
    expect(downloadFileName('a???///b', 'png')).toBe('a-b.png');
  });

  it('does not start or end with a dot, a dash or a space', () => {
    expect(downloadFileName('  ..hidden.. ', 'png')).toBe('hidden.png');
    expect(downloadFileName('/name/', 'png')).toBe('name.png');
  });

  it('falls back to "diagram" when nothing usable is left', () => {
    expect(downloadFileName('', 'png')).toBe('diagram.png');
    expect(downloadFileName('   ', 'png')).toBe('diagram.png');
    expect(downloadFileName('???', 'png')).toBe('diagram.png');
  });

  it('cuts a very long name', () => {
    const name = downloadFileName('x'.repeat(300), 'png');
    expect(name).toBe(`${'x'.repeat(100)}.png`);
  });
});
