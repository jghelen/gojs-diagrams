/** Longest name, without the extension, that a downloaded file gets. */
const MAX_LENGTH = 100;

/**
 * A file name for a download, made from the name of the diagram.
 *
 * Letters (of any alphabet), digits, spaces and `. _ - ( )` are kept. Everything
 * else is replaced by a dash: characters that no file system accepts, such as
 * `/ \ : * ? " < > |`, and other symbols that some systems or browsers change or
 * refuse. A name with nothing usable in it becomes "diagram".
 */
export function downloadFileName(name: string, extension: string): string {
  const safe = name
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ._()-]+/gu, '-')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_LENGTH)
    // A name must not start or end with a dot, a dash or a space.
    .replace(/^[ .-]+|[ .-]+$/g, '');
  return `${safe || 'diagram'}.${extension}`;
}
