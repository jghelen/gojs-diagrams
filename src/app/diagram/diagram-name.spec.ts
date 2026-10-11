import { DATASETS } from './datasets';
import { DIAGRAM_NAME_RULE, checkedDiagramName, withoutSpecialCharacters } from './diagram-name';

describe('withoutSpecialCharacters', () => {
  it('keeps letters, digits and spaces as they are', () => {
    expect(withoutSpecialCharacters('Meridian Global FoF 2026')).toBe('Meridian Global FoF 2026');
  });

  it('takes out punctuation and symbols', () => {
    expect(withoutSpecialCharacters('Meridian SICAV: structure 2026/Q3 "draft"?')).toBe(
      'Meridian SICAV structure 2026Q3 draft',
    );
    expect(withoutSpecialCharacters('a-b_c.d(e)f,g;h!i@j#k$l%m^n&o*p+q=r')).toBe(
      'abcdefghijklmnopqr',
    );
    expect(withoutSpecialCharacters('<script>alert(1)</script>')).toBe('scriptalert1script');
  });

  it('leaves nothing of a name that is made of special characters only', () => {
    expect(withoutSpecialCharacters('***')).toBe('');
    expect(withoutSpecialCharacters('')).toBe('');
  });

  it('keeps the letters of other alphabets, with their accents', () => {
    expect(withoutSpecialCharacters('Šuma Čačak Đerdap 3')).toBe('Šuma Čačak Đerdap 3');
    expect(withoutSpecialCharacters('Фонд № 7')).toBe('Фонд  7');
    expect(withoutSpecialCharacters('München Fonds ß')).toBe('München Fonds ß');
  });

  it('takes out emoji, tabs and line breaks', () => {
    expect(withoutSpecialCharacters('Fund 🚀\tA\nB')).toBe('Fund AB');
  });

  it('finds nothing to take out of the names the diagrams start with', () => {
    for (const dataset of DATASETS) {
      expect(withoutSpecialCharacters(dataset.label)).toBe(dataset.label);
    }
  });

  it('comes with the rule in words', () => {
    expect(DIAGRAM_NAME_RULE).toBe('Letters, digits and spaces only');
  });
});

describe('checkedDiagramName', () => {
  it('lets a name through that keeps to the rule', () => {
    expect(checkedDiagramName('Meridian holdings 2026')).toEqual({
      name: 'Meridian holdings 2026',
      refused: null,
    });
  });

  it('cleans a name with special characters and says which name it was', () => {
    expect(checkedDiagramName('Meridian SICAV: 2026/Q3 (draft)')).toEqual({
      name: 'Meridian SICAV 2026Q3 draft',
      refused: 'Meridian SICAV: 2026/Q3 (draft)',
    });
  });

  it('refuses a name that is made of special characters only, leaving none', () => {
    expect(checkedDiagramName('***')).toEqual({ name: '', refused: '***' });
  });

  it('does not count spaces around a name as a fault', () => {
    expect(checkedDiagramName('  Meridian  ')).toEqual({ name: 'Meridian', refused: null });
    expect(checkedDiagramName('')).toEqual({ name: '', refused: null });
  });

  it('finds no fault with the names the diagrams of the app start with', () => {
    for (const dataset of DATASETS) expect(checkedDiagramName(dataset.label).refused).toBeNull();
  });
});
