const KEY = 'pinnedRepos';

// Source of truth for rendering. Storage is only ever a mirror of this, so a
// failed chrome.* call can never blank out the sidebar.
let pins = [];

// chrome.* throws "Extension context invalidated" in tabs still running an old
// copy of this script after the extension is reloaded. Never let it escape.
const safe = fn => { try { return fn(); } catch (e) { console.debug('GitPin:', e); } };

// The panel's class names are build-hashed, so nothing is hardcoded: we clone
// GitHub's own "Top repositories" group and rewrite the text/href.
// Several anchors, because opening the panel's search swaps the heading for an
// input and removes the search button — the repo items are what survive.
// ponytail: all three are data-testids. If GitHub drops them, fall back to
// matching the "Top repositories" heading text.
const ANCHORS = [
  '[data-testid="dynamic-side-panel-items-search-button"]',
  '[data-testid="dynamic-side-panel-items-item"]',
  '[data-testid="dynamic-side-panel-items-show-more"]'
].join(',');

function findGroup() {
  for (const el of document.querySelectorAll(ANCHORS)) {
    const g = el.closest('[data-component="ActionList.Group"]');
    if (g && g.id !== 'gh-pinned') return g;
  }
  return null;
}

// Templates survive search mode, where GitHub temporarily removes the heading
// we clone from.
let tplItem = null;
let tplHead = null;

function build(group, repos) {
  const liveItem = group.querySelector('[data-testid="dynamic-side-panel-items-item"]')?.closest('li');
  // must still be a real heading — in search mode the wrapper holds an input
  const liveHead = group.querySelector('[data-component="GroupHeadingWrap"]:has(h3)');
  if (liveItem) tplItem = liveItem.cloneNode(true);
  if (liveHead) tplHead = liveHead.cloneNode(true);

  const sampleItem = tplItem;
  const sampleHead = tplHead;
  if (!sampleItem || !sampleHead || !group.firstElementChild) return null;

  const box = group.cloneNode(false);
  box.id = 'gh-pinned';
  const ul = group.firstElementChild.cloneNode(false);
  box.append(ul);

  const head = sampleHead.cloneNode(true);
  head.querySelectorAll('button, [popover]').forEach(n => n.remove());
  const h = head.querySelector('h3');
  if (!h) return null;
  (h.firstElementChild || h).textContent = 'Pinned repositories';
  ul.append(head);

  for (const r of repos) {
    const li = sampleItem.cloneNode(true);
    const a = li.querySelector('a');
    a.href = `/${r}`;
    // full page load — don't hand a synthetic href to GitHub's SPA router
    a.removeAttribute('data-discover');
    a.removeAttribute('data-testid');
    ['id', 'aria-labelledby'].forEach(k => a.removeAttribute(k));

    const visual = li.querySelector('[data-component="ActionList.LeadingVisual"]');
    visual.textContent = '📌';
    visual.style.fontSize = '13px';

    const label = li.querySelector('[data-component="ActionList.Item.Label"]');
    label.removeAttribute('id');
    label.textContent = r;

    const x = document.createElement('button');
    x.className = 'gh-unpin';
    x.type = 'button';
    x.textContent = '✕';
    x.title = `Unpin ${r}`;
    x.onclick = e => { e.preventDefault(); e.stopPropagation(); unpin(r); };
    li.append(x);

    ul.append(li);
  }

  if (!repos.length) {
    const li = sampleItem.cloneNode(true);
    const a = li.querySelector('a');
    a.removeAttribute('href');
    a.removeAttribute('data-discover');
    a.style.opacity = '0.6';
    li.querySelector('[data-component="ActionList.LeadingVisual"]').textContent = '📌';
    li.querySelector('[data-component="ActionList.Item.Label"]').textContent = 'Drag a repo here';
    ul.append(li);
  }
  return box;
}

// What the DOM currently claims to be showing, so a stale section is as
// detectable as a missing one.
const sig = () => pins.join(',');
const stale = () => {
  const box = document.getElementById('gh-pinned');
  return !box || box.dataset.pins !== sig();
};

// Synchronous, and it builds the replacement before removing the old section —
// so a failure anywhere leaves what is already on screen untouched.
function draw() {
  const group = findGroup();
  if (!group || !group.parentNode) return;

  const box = build(group, pins);
  if (!box) return;
  box.dataset.pins = sig();

  document.querySelectorAll('#gh-pinned, .gh-pinned-divider').forEach(n => n.remove());
  group.parentNode.insertBefore(box, group);

  const divider = document.querySelector('[data-component="ActionList.Divider"]');
  if (divider) {
    const d = divider.cloneNode(true);
    d.className += ' gh-pinned-divider';
    group.parentNode.insertBefore(d, group);
  }
}

const redraw = () => { if (stale()) draw(); };

// Optimistic: memory and DOM update now, storage catches up after. The retries
// cover GitHub re-rendering the panel over us in the same tick as the drop.
function setPins(next) {
  pins = next;
  draw();
  requestAnimationFrame(redraw);
  setTimeout(redraw, 300);
  safe(() => chrome.storage.sync.set({ [KEY]: pins }));
}

const unpin = r => setPins(pins.filter(p => p !== r));

// Drag & drop: GitHub's sidebar entries are plain <a> tags, so they are natively
// draggable and already carry their URL — nothing to patch on GitHub's side.
function repoFromDrop(dt) {
  const raw = dt.getData('text/uri-list') || dt.getData('text/plain');
  try {
    const u = new URL(raw, location.origin);
    return u.hostname === 'github.com' ? repoFromPath(u.pathname) : null;
  } catch { return null; }
}

const dropBox = e => e.target.closest?.('#gh-pinned');

// Capture phase: GitHub's dialog gets these events after us, so it cannot
// stopPropagation() the drop out from under the extension.
document.addEventListener('dragover', e => {
  const box = dropBox(e);
  if (!box) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  box.classList.add('gh-drop');
}, true);

document.addEventListener('dragleave', e => {
  const box = dropBox(e);
  if (box && !box.contains(e.relatedTarget)) box.classList.remove('gh-drop');
}, true);

document.addEventListener('drop', e => {
  const box = dropBox(e);
  if (!box) return;
  e.preventDefault();
  box.classList.remove('gh-drop');
  const repo = repoFromDrop(e.dataTransfer);
  console.debug('GitPin: drop ->', repo);
  if (repo && !pins.includes(repo)) setPins([...pins, repo]);
}, true);

// Heals anything that removed or reverted our section — GitHub re-rendering
// the panel, the panel closing and reopening, a failed insert.
let queued = false;
new MutationObserver(() => {
  if (queued || !stale()) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; draw(); });
}).observe(document.body, { childList: true, subtree: true });

safe(() => chrome.storage.sync.get(KEY, v => { pins = v[KEY] || []; draw(); }));
safe(() => chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[KEY]) { pins = changes[KEY].newValue || []; draw(); }
}));
draw();
