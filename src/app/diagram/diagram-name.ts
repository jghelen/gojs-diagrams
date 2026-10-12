/**
 * What the name of a diagram may consist of: letters of any alphabet, digits
 * and spaces. Nothing else, so no punctuation and no symbols.
 *
 * To allow another character, say a hyphen, add it inside the brackets below.
 */
const NOT_ALLOWED_IN_A_NAME = /[^\p{L}\p{N} ]/gu;

/** The rule in the words the user is shown when a character was not accepted. */
export const DIAGRAM_NAME_RULE = 'Letters, digits and spaces only';

/** The text with every character taken out that a diagram's name may not contain. */
export function withoutSpecialCharacters(text: string): string {
  return text.replace(NOT_ALLOWED_IN_A_NAME, '');
}

/**
 * Checks the name a diagram arrives with when it is opened, for instance from a
 * database, where a name may have been stored before this rule existed.
 *
 * Gives back the name to use, with its special characters taken out, and in
 * `refused` the name as it arrived if anything had to be taken out; null if the
 * name was fine. The page shows the cleaned name and says which name it refused.
 */
export function checkedDiagramName(arrived: string): { name: string; refused: string | null } {
  const name = withoutSpecialCharacters(arrived).trim();
  return { name, refused: name === arrived.trim() ? null : arrived };
}
