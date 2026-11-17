const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True when a key press is going into a field, so a shortcut must leave it alone. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (TYPING_TAGS.has(target.tagName) || target.isContentEditable === true)
  );
}
