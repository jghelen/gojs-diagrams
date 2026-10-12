/** A yes/no setting remembered by the browser; `fallback` when there is none or storage is blocked. */
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}

/** Remembers a yes/no setting in the browser, if the browser lets it. */
export function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Not remembered, then; the setting still works until the page is closed.
  }
}

/** Asks the user a yes/no question in the browser's own dialog; true for yes. */
export function confirmWithUser(question: string): boolean {
  return window.confirm(question);
}

/** Opens `url` the way a link with target="_blank" does: in a new tab, never a popup window. */
export function openInNewTab(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.click();
}
