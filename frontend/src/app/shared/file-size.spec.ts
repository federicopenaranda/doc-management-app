import { formatSize } from './file-size';

describe('formatSize', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.0 MB'],
    [5.5 * 1024 * 1024, '5.5 MB'],
  ])('shows %d bytes as %s', (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });
});
