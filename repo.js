// "owner/repo" from a github.com pathname, or null if it isn't a repo page.
const RESERVED = new Set([
  'settings', 'notifications', 'orgs', 'organizations', 'marketplace', 'explore',
  'topics', 'sponsors', 'codespaces', 'pulls', 'issues', 'search', 'new',
  'about', 'pricing', 'features', 'apps', 'users', 'account', 'dashboard'
]);

function repoFromPath(pathname) {
  const [owner, repo] = pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (!owner || !repo || RESERVED.has(owner)) return null;
  return `${owner}/${repo}`;
}

if (typeof module !== 'undefined') module.exports = { repoFromPath };
