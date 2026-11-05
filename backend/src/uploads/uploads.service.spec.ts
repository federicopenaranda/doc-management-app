import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { UploadsService } from './uploads.service.js';

const NOW = new Date('2026-11-05T12:00:00.000Z');

function setup() {
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
  const config = { get: () => 'dms-docs' } as unknown as ConfigService<
    Env,
    true
  >;
  return { sign, service: new UploadsService({ sign }, config, () => NOW) };
}

describe('UploadsService.sign', () => {
  it('signs one PUT url per file for the landing bucket, valid 15 minutes', async () => {
    const { service, sign } = setup();

    const result = await service.sign([
      { name: 'a.pdf', size: 10, contentType: 'application/pdf' },
      { name: 'b b.txt', size: 5, contentType: 'text/plain' },
    ]);

    expect(sign).toHaveBeenCalledWith(
      'dms-docs',
      'a.pdf',
      'application/pdf',
      new Date('2026-11-05T12:15:00.000Z'),
    );
    expect(result).toEqual([
      {
        name: 'a.pdf',
        url: 'https://signed.example/a.pdf',
        headers: {
          'Content-Type': 'application/pdf',
          'x-goog-if-generation-match': '0',
        },
      },
      {
        name: 'b b.txt',
        url: 'https://signed.example/b b.txt',
        headers: {
          'Content-Type': 'text/plain',
          'x-goog-if-generation-match': '0',
        },
      },
    ]);
  });

  it('propagates a signing failure', async () => {
    const { service, sign } = setup();
    sign.mockRejectedValue(new Error('iam down'));

    await expect(
      service.sign([{ name: 'a.pdf', size: 1, contentType: 'text/plain' }]),
    ).rejects.toThrow('iam down');
  });
});
