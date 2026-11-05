import { readFileSync } from 'node:fs';

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/; // same rule as scripts/pull-env.mjs

/**
 * Loads the app configuration from the JSON file named by APP_CONFIG_FILE (a Secret Manager secret
 * mounted by Cloud Run) into `env`. Variables that are already set win, so values Terraform sets as
 * plain environment variables override the same keys in the file.
 *
 * Errors name the file and never include its contents: JSON.parse messages can quote the input.
 */
export function loadAppConfig(
  env: NodeJS.ProcessEnv = process.env,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): void {
  const path = env.APP_CONFIG_FILE;
  if (!path) return;

  let text: string;
  try {
    text = readFile(path);
  } catch {
    throw new Error(`APP_CONFIG_FILE ${path} could not be read`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`APP_CONFIG_FILE ${path} is not valid JSON`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`APP_CONFIG_FILE ${path} must contain a JSON object`);
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  for (const [key, value] of entries) {
    // A typo such as "log_level" or "NODE_ENV " would otherwise be ignored and the default used silently.
    if (!ENV_NAME.test(key)) {
      throw new Error(
        `APP_CONFIG_FILE ${path}: invalid variable name ${JSON.stringify(key)} (use UPPER_SNAKE_CASE)`,
      );
    }
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error(
        `APP_CONFIG_FILE ${path}: "${key}" must be a string, number or boolean`,
      );
    }
  }

  for (const [key, value] of entries) {
    if (env[key] === undefined) env[key] = String(value);
  }
}
