// The Terraform plan is posted as a pull request comment in a public repository. GitHub masks secrets in
// logs but not in comments, and resource ids (e.g. an IAM member's) contain the member's address.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const redact = require('../../.github/scripts/redact-plan.cjs');

describe('redact', () => {
  it('hides personal addresses, including inside resource ids', () => {
    const line =
      'google_secret_manager_secret_iam_member.local_readers["a|0"]: Refreshing state... [id=projects/p/secrets/s/roles/x/user:someone@gmail.com]';

    const out = redact(line);

    assert.ok(!out.includes('someone@gmail.com'));
    assert.ok(out.includes('user:***]'));
  });

  it('hides every occurrence, in any case', () => {
    const out = redact('a Someone@Example.COM and b other.person+tag@work.example.org');

    assert.equal(out, 'a *** and b ***');
  });

  it('keeps service account addresses: they are not personal and the plan needs them', () => {
    const text = 'member = "serviceAccount:backend-run@doc-management-sandbox.iam.gserviceaccount.com"';

    assert.equal(redact(text), text);
  });

  it('leaves text without addresses untouched', () => {
    const text = 'Plan: 4 to add, 0 to change, 0 to destroy.\n  # google_pubsub_subscription.x will be created';

    assert.equal(redact(text), text);
  });
});
