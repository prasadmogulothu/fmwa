// Run: node api/users.check.mjs
// Asserts the UUID guard's behaviour directly, since it is a security
// boundary (the DELETE id reaches a URL template verbatim in api/users.js)
// rather than importing the handler, which needs SUPABASE_URL/SERVICE env.
import assert from 'node:assert/strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

assert.equal(UUID.test('123e4567-e89b-12d3-a456-426614174000'), true, 'well-formed uuid passes');
assert.equal(
  UUID.test('../../../../rest/v1/fmwa_photos'),
  false,
  'path traversal segment must fail'
);
assert.equal(UUID.test(''), false, 'empty string must fail');
assert.equal(UUID.test('123E4567-E89B-12D3-A456-426614174000'), true, 'uppercase uuid passes');

console.log('users.check.mjs OK');
