import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from './validation.js';

const schema = z.object({
  email: z.email(),
  files: z.array(z.object({ name: z.string() })),
});

describe('parseBody', () => {
  it('returns the parsed data when the body is valid', () => {
    const body = { email: 'ana@example.com', files: [{ name: 'a.pdf' }] };

    expect(parseBody(schema, body)).toEqual(body);
  });

  it('throws a 400 with one error per problem, each naming its field', () => {
    let error: unknown;
    try {
      parseBody(schema, { email: 'nope', files: [{ name: 1 }] });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      errors: [
        { field: 'email', message: expect.any(String) },
        { field: 'files.0.name', message: expect.any(String) },
      ],
    });
  });

  it('leaves the field out for a problem with the body itself', () => {
    let error: unknown;
    try {
      parseBody(schema, 'not an object');
    } catch (caught) {
      error = caught;
    }

    expect((error as BadRequestException).getResponse()).toEqual({
      errors: [{ message: expect.any(String) }],
    });
  });
});
