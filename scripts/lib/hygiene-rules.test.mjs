import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDenyList, scanText } from './hygiene-rules.mjs';

test('allows example.com and noreply addresses', () => {
  const text = ['a@example.com', '1+x@users.noreply.github.com', 'noreply@anthropic.com'].join('\n');
  assert.deepEqual(scanText(text, []), []);
});

test('flags any other email without echoing it', () => {
  const [finding] = scanText(['hi', `write to someone${'@'}mail.test`].join('\n'), []);
  assert.deepEqual(finding, { line: 2, rule: 'email outside example.com' });
});

test('deny patterns match case-insensitively, skipping comments and blanks', () => {
  const deny = parseDenyList('# comment\n\nsecret-name\n');
  assert.equal(deny.length, 1);
  assert.deepEqual(scanText('ok\nSECRET-NAME here', deny), [{ line: 2, rule: 'deny-list pattern #1' }]);
});
