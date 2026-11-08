import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

export interface ScryptParams {
  /** CPU/memory cost, a power of two. */
  N: number;
  r: number;
  p: number;
}

/** OWASP's recommended scrypt setting (64 MiB, about 0.1 s). Every hash stores the parameters it used. */
export const SCRYPT_PARAMS: ScryptParams = { N: 2 ** 16, r: 8, p: 1 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
// Stored values come from our own database, but a corrupted row must not be able to ask for much memory:
// 128 * N * r bytes, so at most 128 MiB per check (the default setting uses 64 MiB).
const MAX_N = 2 ** 17;
const MAX_R = 8;
const MAX_P = 4;

/** The same password typed as one composed character or as letter plus accent must hash alike. */
function normalize(password: string): string {
  return password.normalize('NFKC');
}

function options({ N, r, p }: ScryptParams): ScryptOptions {
  // Node's default memory cap (32 MiB) is below what N = 2^16 needs.
  return { N, r, p, maxmem: 256 * N * r };
}

/** "scrypt$N$r$p$salt$hash" (salt and hash in base64): everything needed to verify, nothing to reverse. */
export async function hashPassword(
  password: string,
  params: ScryptParams = SCRYPT_PARAMS,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scrypt(
    normalize(password),
    salt,
    KEY_LENGTH,
    options(params),
  );
  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/** False for a wrong password and for any stored value that is not a valid hash; never throws. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;
  if (![n, r, p].every((value) => /^\d+$/.test(value))) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (params.N > MAX_N || params.r > MAX_R || params.p > MAX_P) return false;

  const expected = Buffer.from(hash, 'base64');
  if (expected.length === 0) return false;
  try {
    const actual = await scrypt(
      normalize(password),
      Buffer.from(salt, 'base64'),
      expected.length,
      options(params),
    );
    return timingSafeEqual(actual, expected);
  } catch {
    // For example an N that is not a power of two.
    return false;
  }
}
