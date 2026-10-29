import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseFetch } from '../scripts/publish-pages.mjs';

test('local publisher reads GitHub metadata through the existing gh login', async () => {
  const calls = [];
  const response = await releaseFetch('https://api.github.com/repos/joeshang/turtle-notes-site/releases?per_page=100', {},
    async endpoint => { calls.push(endpoint); return '[]'; },
    async () => { throw new Error('API request was anonymous'); });
  assert.deepEqual(calls, ['repos/joeshang/turtle-notes-site/releases?per_page=100']);
  assert.deepEqual(await response.json(), []);
});

test('release downloads remain anonymous and do not use gh credentials', async () => {
  let called = false;
  const options = { headers: { Accept: 'application/octet-stream' } };
  const response = await releaseFetch('https://github.com/joeshang/turtle-notes-site/releases/download/v1.2.0/test.dmg', options,
    async () => { throw new Error('Download must not use authenticated API'); },
    async (url, passed) => { called = true; assert.equal(passed, options); return new Response('bytes'); });
  assert.ok(called); assert.equal(await response.text(), 'bytes');
});
