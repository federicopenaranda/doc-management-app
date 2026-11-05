import { parse } from 'dotenv';
import {
  parseSecretJson,
  pullEnv,
  requireProject,
  secretName,
  toEnvText,
} from './pull-env.mjs';

const SECRET = 'super-secret-value-123';

function messageOf(action) {
  try {
    action();
  } catch (error) {
    return error.message;
  }
  throw new Error('expected the action to throw');
}

describe('parseSecretJson', () => {
  it('returns a flat object of strings, numbers and booleans', () => {
    expect(parseSecretJson('{"A_B":"x","PORT":3000,"FLAG":true}')).toEqual({
      A_B: 'x',
      PORT: 3000,
      FLAG: true,
    });
  });

  it.each([
    ['invalid JSON', `{"JWT_SECRET": "${SECRET}", oops`],
    ['an array', `["${SECRET}"]`],
    ['null', 'null'],
    ['a nested object', `{"DATABASE": {"password": "${SECRET}"}}`],
    ['a lowercase key', `{"jwt_secret": "${SECRET}"}`],
    ['a key with a newline', `{"A\\nB": "${SECRET}"}`],
  ])('rejects %s without echoing any value', (_label, text) => {
    expect(messageOf(() => parseSecretJson(text))).not.toContain(SECRET);
  });
});

describe('toEnvText', () => {
  it('round trips tricky values through dotenv (what @nestjs/config uses)', () => {
    const values = {
      HASH_QUOTES_BACKSLASH: 'p#ss "q" \\ = $HOME',
      URL: 'postgresql://u:p@h:5432/db?x=1#y',
      SINGLE_AND_DOUBLE: `it's "both"`,
      MULTILINE: 'line1\nline2',
      LITERAL_BACKSLASH_N: 'C:\\new',
      PORT: 3000,
      FLAG: true,
    };

    expect(parse(toEnvText(values))).toEqual({
      ...values,
      PORT: '3000',
      FLAG: 'true',
    });
  });

  it('refuses a value it cannot write safely, without echoing it', () => {
    const message = messageOf(() => toEnvText({ BAD: `a'b"c\`d${SECRET}` }));

    expect(message).toContain('BAD');
    expect(message).not.toContain(SECRET);
  });
});

describe('secretName', () => {
  it('is backend-<env>', () => {
    expect(secretName('local')).toBe('backend-local');
    expect(secretName('prod')).toBe('backend-prod');
  });

  it('rejects unknown environments', () => {
    expect(() => secretName('dev')).toThrow('local, sandbox, prod');
  });
});

describe('requireProject', () => {
  it('returns the first value that is set', () => {
    expect(requireProject('from-flag', 'from-env')).toBe('from-flag');
    expect(requireProject(undefined, 'from-env')).toBe('from-env');
  });

  it('asks for --project when nothing is set', () => {
    expect(() => requireProject(undefined, undefined)).toThrow('--project');
  });
});

describe('pullEnv', () => {
  const fakeClient = (json) => ({
    accessSecretVersion: vi.fn(async () => [
      { payload: { data: Buffer.from(json) } },
    ]),
  });

  it('reads the latest version, writes the .env file and returns key names only', async () => {
    const client = fakeClient(`{"JWT_SECRET":"${SECRET}","PORT":3000}`);
    const writeFile = vi.fn(async () => {});

    const result = await pullEnv({
      env: 'local',
      project: 'p',
      out: '.env',
      client,
      writeFile,
    });

    expect(client.accessSecretVersion).toHaveBeenCalledWith({
      name: 'projects/p/secrets/backend-local/versions/latest',
    });
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(parse(writeFile.mock.calls[0][1])).toEqual({
      JWT_SECRET: SECRET,
      PORT: '3000',
    });
    expect(result).toEqual({ file: '.env', keys: ['JWT_SECRET', 'PORT'] });
  });

  it('writes nothing when the secret is not a valid flat JSON object', async () => {
    const writeFile = vi.fn(async () => {});

    await expect(
      pullEnv({
        env: 'local',
        project: 'p',
        out: '.env',
        client: fakeClient(`["${SECRET}"]`),
        writeFile,
      }),
    ).rejects.toThrow('backend-local');
    expect(writeFile).not.toHaveBeenCalled();
  });
});
