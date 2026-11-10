import { BadRequestException } from '@nestjs/common';
import { UploadsController } from './uploads.controller.js';
import type { UploadsService } from './uploads.service.js';

function setup() {
  const sign = vi.fn().mockResolvedValue([{ name: 'a.pdf' }]);
  return {
    sign,
    controller: new UploadsController({
      sign,
    } as unknown as UploadsService),
  };
}

const file = (over: Record<string, unknown> = {}) => ({
  name: 'a.pdf',
  size: 10,
  contentType: 'application/pdf',
  ...over,
});

describe('UploadsController.sign', () => {
  it('signs a valid request', async () => {
    const { controller, sign } = setup();

    await expect(controller.sign({ files: [file()] })).resolves.toEqual({
      uploads: [{ name: 'a.pdf' }],
    });
    expect(sign).toHaveBeenCalledWith([file()]);
  });

  it('defaults a missing contentType to application/octet-stream', async () => {
    const { controller, sign } = setup();

    await controller.sign({ files: [{ name: 'a.bin', size: 1 }] });

    expect(sign).toHaveBeenCalledWith([
      { name: 'a.bin', size: 1, contentType: 'application/octet-stream' },
    ]);
  });

  it.each([
    ['no body', undefined],
    ['no files', { files: [] }],
    [
      '21 files',
      {
        files: Array.from({ length: 21 }, (_, i) =>
          file({ name: `f${i}.pdf` }),
        ),
      },
    ],
    ['an empty name', { files: [file({ name: '' })] }],
    ['a name with a slash', { files: [file({ name: 'a/b.pdf' })] }],
    [
      'a name with a backslash',
      { files: [file({ name: String.raw`a\b.pdf` })] },
    ],
    ['a dot name', { files: [file({ name: '..' })] }],
    [
      'a name with a control character',
      { files: [file({ name: 'a\nb.pdf' })] },
    ],
    ['a 256 character name', { files: [file({ name: 'a'.repeat(256) })] }],
    ['a zero size', { files: [file({ size: 0 })] }],
    ['a file over 100 MB', { files: [file({ size: 100 * 1024 * 1024 + 1 })] }],
    ['duplicate names', { files: [file(), file()] }],
  ])('rejects %s with 400 and signs nothing', async (_label, body) => {
    const { controller, sign } = setup();

    await expect(controller.sign(body)).rejects.toThrow(BadRequestException);
    expect(sign).not.toHaveBeenCalled();
  });

  it('accepts a file of exactly 100 MB and 20 files', async () => {
    const { controller } = setup();

    await expect(
      controller.sign({
        files: Array.from({ length: 20 }, (_, i) =>
          file({ name: `f${i}.pdf`, size: 100 * 1024 * 1024 }),
        ),
      }),
    ).resolves.toBeDefined();
  });
});
