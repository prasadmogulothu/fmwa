// Run: node api/users.check.mjs
// Asserts the two security boundaries in api/users.js directly — the UUID
// guard (the DELETE id reaches a URL template verbatim) and the SITE domain
// pin (the Supabase project is shared with other sites' accounts) — rather
// than importing the handler, which needs SUPABASE_URL/SERVICE env. Importing
// the real constants, not copies, so loosening either one fails here.
import assert from 'node:assert/strict';
import { SITE, UUID } from './users.js';

assert.equal(UUID.test('123e4567-e89b-12d3-a456-426614174000'), true, 'well-formed uuid passes');
assert.equal(
  UUID.test('../../../../rest/v1/fmwa_photos'),
  false,
  'path traversal segment must fail'
);
assert.equal(UUID.test(''), false, 'empty string must fail');
assert.equal(UUID.test('123E4567-E89B-12D3-A456-426614174000'), true, 'uppercase uuid passes');

const ours = (email) =>
  String(email || '')
    .toLowerCase()
    .endsWith(SITE);

assert.equal(SITE.startsWith('@'), true, 'the leading @ is what anchors the domain');
assert.equal(ours('x@fortunemeadows.local'), true, 'this site passes');
assert.equal(ours('X@FortuneMeadows.LOCAL'), true, 'case is folded before the check');
assert.equal(ours('evil@notfortunemeadows.local'), false, 'suffix look-alike must fail');
assert.equal(ours('x@muralielectronics.local'), false, 'another tenant must fail');
assert.equal(ours('platform@hhappsolutions.local'), false, 'the platform admin must fail');
assert.equal(ours(''), false, 'empty string must fail');

console.log('users.check.mjs OK');
