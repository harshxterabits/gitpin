const assert = require('node:assert');
const { repoFromPath } = require('./repo.js');

assert.equal(repoFromPath('/harshxterabits/my-saas'), 'harshxterabits/my-saas');
assert.equal(repoFromPath('/owner/repo/tree/main/src'), 'owner/repo');
assert.equal(repoFromPath('/owner/repo/'), 'owner/repo');
assert.equal(repoFromPath('/'), null);
assert.equal(repoFromPath('/harshxterabits'), null);
assert.equal(repoFromPath('/settings/profile'), null);
assert.equal(repoFromPath('/orgs/terabits/repositories'), null);
console.log('ok');
