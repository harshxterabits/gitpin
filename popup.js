// Firefox's chrome.* shim is callback-only; browser.* is the promise API.
// Chrome MV3 has promises on chrome.* already, so this covers both.
const api = globalThis.browser ?? globalThis.chrome;

const KEY = 'pinnedRepos';
const get = async () => (await api.storage.sync.get(KEY))[KEY] || [];
const set = repos => api.storage.sync.set({ [KEY]: repos });

const list = document.getElementById('list');
const empty = document.getElementById('empty');
const toggle = document.getElementById('toggle');

async function draw(current) {
  const repos = await get();

  list.textContent = '';
  empty.hidden = repos.length > 0;
  for (const r of repos) {
    const a = document.createElement('a');
    a.href = `https://github.com/${r}`;
    a.textContent = r;
    a.target = '_blank';

    const x = document.createElement('button');
    x.textContent = '✕';
    x.title = 'Unpin';
    x.onclick = async () => { await set((await get()).filter(p => p !== r)); draw(current); };

    const li = document.createElement('li');
    li.append(a, x);
    list.append(li);
  }

  toggle.hidden = !current;
  if (!current) return;
  const pinned = repos.includes(current);
  toggle.textContent = `${pinned ? '📌 Unpin' : '📌 Pin'} ${current}`;
  toggle.onclick = async () => {
    const now = await get();
    await set(pinned ? now.filter(p => p !== current) : [...now, current]);
    draw(current);
  };
}

api.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  let current = null;
  try {
    const url = new URL(tab.url);
    if (url.hostname === 'github.com') current = repoFromPath(url.pathname);
  } catch {}
  draw(current);
});
