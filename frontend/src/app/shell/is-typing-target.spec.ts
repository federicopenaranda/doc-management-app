import { isTypingTarget } from './is-typing-target';

describe('isTypingTarget', () => {
  it.each(['input', 'textarea', 'select'])('is true for a %s', (tag) => {
    expect(isTypingTarget(document.createElement(tag))).toBe(true);
  });

  it('is true for a contenteditable element', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    // jsdom does not implement isContentEditable, so mirror what a browser reports.
    Object.defineProperty(div, 'isContentEditable', { value: true });

    expect(isTypingTarget(div)).toBe(true);
  });

  it('is false for a button, the body and null', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
