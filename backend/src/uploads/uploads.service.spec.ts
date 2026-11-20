import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { UsersRepository } from '../auth/users.repository.js';
import type { Env } from '../config/env.validation.js';
import { originalKey } from '../documents/document-key.js';
import { UploadsService } from './uploads.service.js';

const NOW = new Date('2026-11-05T12:00:00.000Z');
const FOLDER = 'acme-20261103-3f9a1c2b';

function setup(folder: string | null = FOLDER) {
  const sign = vi
    .fn<
      (
        bucket: string,
        name: string,
        contentType: string,
        expires: Date,
      ) => Promise<string>
    >()
    .mockImplementation((_b, name) =>
      Promise.resolve(`https://signed.example/${name}`),
    );
  const uploadFolderOf = vi.fn(() => Promise.resolve(folder));
  const config = { get: () => 'dms-docs' } as unknown as ConfigService<
    Env,
    true
  >;
  return {
    sign,
    uploadFolderOf,
    service: new UploadsService({ sign }, config, () => NOW, {
      uploadFolderOf,
    } as unknown as UsersRepository),
  };
}

describe('UploadsService.sign', () => {
  it('signs one PUT url per file, under the client folder, valid 15 minutes', async () => {
    const { service, sign, uploadFolderOf } = setup();

    const result = await service.sign('u1', [
      { name: 'a.pdf', size: 10, contentType: 'application/pdf' },
      { name: 'b b.txt', size: 5, contentType: 'text/plain' },
    ]);

    expect(uploadFolderOf).toHaveBeenCalledWith('u1');
    expect(sign).toHaveBeenCalledWith(
      'dms-docs',
      originalKey(FOLDER, 'a.pdf'),
      'application/pdf',
      new Date('2026-11-05T12:15:00.000Z'),
    );
    expect(result).toEqual([
      {
        name: 'a.pdf',
        url: `https://signed.example/${originalKey(FOLDER, 'a.pdf')}`,
        headers: {
          'Content-Type': 'application/pdf',
          'x-goog-if-generation-match': '0',
        },
      },
      {
        name: 'b b.txt',
        url: `https://signed.example/${originalKey(FOLDER, 'b b.txt')}`,
        headers: {
          'Content-Type': 'text/plain',
          'x-goog-if-generation-match': '0',
        },
      },
    ]);
  });

  it('refuses a user who cannot upload and signs nothing', async () => {
    const { service, sign } = setup(null);

    await expect(
      service.sign('u1', [
        { name: 'a.pdf', size: 1, contentType: 'text/plain' },
      ]),
    ).rejects.toThrow(ForbiddenException);
    expect(sign).not.toHaveBeenCalled();
  });

  it('propagates a signing failure', async () => {
    const { service, sign } = setup();
    sign.mockRejectedValue(new Error('iam down'));

    await expect(
      service.sign('u1', [
        { name: 'a.pdf', size: 1, contentType: 'text/plain' },
      ]),
    ).rejects.toThrow('iam down');
  });
});
