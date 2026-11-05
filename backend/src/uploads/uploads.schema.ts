import { z } from 'zod';

const MAX_FILES = 20;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const fileName = z
  .string()
  .min(1)
  .max(255)
  // The name becomes the object name in the bucket: no folders, no control characters.
  // oxlint-disable-next-line no-control-regex -- matching control characters is the point
  .refine((name) => !/[/\\\u0000-\u001f\u007f]/.test(name), {
    message: 'must not contain slashes or control characters',
  })
  .refine((name) => name !== '.' && name !== '..', {
    message: 'must not be "." or ".."',
  });

const fileRequest = z.object({
  name: fileName,
  size: z.number().int().positive().max(MAX_FILE_BYTES),
  contentType: z.string().min(1).max(255).default('application/octet-stream'),
});

export const signRequestSchema = z
  .object({ files: z.array(fileRequest).min(1).max(MAX_FILES) })
  .refine(
    ({ files }) =>
      new Set(files.map((file) => file.name)).size === files.length,
    {
      message: 'file names must be unique within one request',
      path: ['files'],
    },
  );

export type FileRequest = z.output<typeof fileRequest>;
