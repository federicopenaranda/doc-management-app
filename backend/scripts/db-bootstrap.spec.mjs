import { bootstrapStatements, quoteIdent } from './db-bootstrap.mjs';

describe('quoteIdent', () => {
  it('double-quotes an identifier and doubles embedded quotes', () => {
    expect(quoteIdent('backend-run@p.iam')).toBe('"backend-run@p.iam"');
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});

describe('bootstrapStatements', () => {
  const iamUser = 'backend-run@doc-management-sandbox.iam';
  const sql = bootstrapStatements(iamUser);
  const table = sql.find((s) => s.includes('CREATE TABLE'));

  it('creates the vector extension and the prueba table only when missing (safe to run twice)', () => {
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    expect(table).toMatch(/CREATE TABLE IF NOT EXISTS prueba/);
  });

  it('gives prueba an identity id, a required message and a creation time', () => {
    expect(table).toMatch(/id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY/);
    expect(table).toMatch(/mensaje text NOT NULL/);
    expect(table).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
  });

  it('lets only the backend identity read and write prueba, with the name quoted', () => {
    const grant = sql.find((s) => s.startsWith('GRANT'));

    expect(grant).toBe(`GRANT SELECT, INSERT ON prueba TO "${iamUser}"`);
  });

  it('inserts one starter row only when the table is empty', () => {
    const insert = sql.find((s) => s.startsWith('INSERT'));

    expect(insert).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM prueba\)/);
  });

  it('refuses a user name with a quote or a semicolon', () => {
    expect(() => bootstrapStatements('x";DROP TABLE prueba;--')).toThrow(
      'DB user',
    );
  });
});
