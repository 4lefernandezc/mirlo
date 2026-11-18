import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const ui = (name) => readFileSync(new URL(`../../app/ui/${name}`, import.meta.url), 'utf8');
const manifestSource = readFileSync(new URL('../../app/src-tauri/src/plugins.rs', import.meta.url), 'utf8');
const manifest = JSON.parse(manifestSource.match(/json!\((\[[\s\S]*?\])\)\s*}/)[1].replace(/,\s*([}\]])/g, '$1'));
const copy = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(setImmediate);

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return (this.text ?? '') + this.children.map((c) => c.textContent).join(' '); }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { children.forEach((c) => this.appendChild(c)); }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  async fire(type) { await Promise.all((this.listeners[type] || []).map((fn) => fn({ target: this }))); }
  checkValidity() {
    if (this.type !== 'number') return true;
    return (!this.required || this.value !== '') && Number.isFinite(Number(this.value)) &&
      (this.min === undefined || Number(this.value) >= Number(this.min)) &&
      (this.max === undefined || Number(this.value) <= Number(this.max));
  }
}
const descendants = (root) => [root, ...root.children.flatMap(descendants)];

async function load(language = 'es') {
  const root = new Element('html');
  const ids = {};
  for (const id of ['reload', 'status', 'search', 'category', 'enabled-only', 'groups', 'empty']) {
    ids[id] = root.appendChild(new Element('div'));
    ids[id].id = id;
  }
  const backend = {
    config: { version: 4, plugins: { 'precise-volume': { enabled: false, steps: 1, savedVolume: 37 } } },
    calls: [], failNext: false, saveError: null, pending: 0, maxPending: 0,
    timer: { id: 0, mode: 'off' }, timerError: null, timerReadDelay: null,
  };
  function merge(target, patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merge(target[key] ||= {}, value);
      } else target[key] = value;
    }
  }
  const window = { __TAURI_INTERNALS__: { async invoke(cmd, args) {
    backend.calls.push({ cmd, args: args && copy(args) });
    if (cmd === 'get_settings_locale') return language;
    if (cmd === 'get_plugin_manifest') return copy(manifest);
    if (cmd === 'get_config') return copy(backend.config);
    if (cmd === 'reload_player') return;
    if (cmd === 'get_sleep_timer') {
      const result = copy(backend.timer);
      if (backend.timerReadDelay) await backend.timerReadDelay;
      return result;
    }
    if (cmd === 'set_sleep_timer') {
      if (backend.timerError) throw backend.timerError;
      backend.timer = { id: backend.timer.id + 1, mode: args.preset === 'off' ? 'off' :
        args.preset === 'track' ? 'track' : 'minutes',
        endsAt: Date.now() + Number(args.preset) * 60_000 };
      return copy(backend.timer);
    }
    if (cmd === 'patch_settings') {
      backend.pending++;
      backend.maxPending = Math.max(backend.maxPending, backend.pending);
      await flush();
      backend.pending--;
      if (backend.failNext) { backend.failNext = false; throw new Error('disk unavailable'); }
      if (backend.saveError) { const error = backend.saveError; backend.saveError = null; throw error; }
      merge(backend.config, copy(args.patch));
      return copy(backend.config);
    }
    throw new Error(`Unexpected command: ${cmd}`);
  } } };
  const document = {
    documentElement: root,
    getElementById: (id) => ids[id] || descendants(root).find((node) => node.id === id),
    createElement: (tag) => new Element(tag),
    querySelectorAll: () => [],
  };
  const intervals = [];
  const context = vm.createContext({ window, document, console, setInterval: (fn) => intervals.push(fn) });
  vm.runInContext(ui('settings-i18n.js'), context);
  vm.runInContext(ui('settings.js'), context);
  await flush();
  const plugin = (id) => descendants(root).find((node) => node.dataset.plugin === id);
  const control = (id, path) => descendants(plugin(id)).find((node) =>
    path ? node.dataset.path === path : node.type === 'checkbox' && !node.dataset.path);
  return { root, ids, backend, window, document, plugin, control, intervals };
}

test('Spanish covers every manifest label and value; unsupported languages fall back to English', async () => {
  const es = await load('es');
  const dictionary = es.window.__MIRLO_SETTINGS_ES__;
  for (const plugin of manifest) {
    for (const text of [plugin.name, plugin.description, ...(plugin.options || []).flatMap((o) => [o.label, ...(o.choices || [])])]) {
      assert(Object.hasOwn(dictionary, text), `Missing Spanish translation: ${text}`);
    }
  }
  assert.equal(es.document.documentElement.lang, 'es');
  assert.equal(es.document.title, 'Mirlo - Ajustes');
  assert.match(es.plugin('precise-volume').textContent, /Volumen preciso/);
  const other = await load('fr');
  assert.equal(other.document.documentElement.lang, 'en');
  assert.equal(other.document.title, 'Mirlo - Settings');
  assert.match(other.plugin('precise-volume').textContent, /Precise volume/);
});

test('rapid toggle, options and general edits are serialized field patches, not stale snapshots', async () => {
  const { backend, control, document } = await load();
  const toggle = control('precise-volume');
  toggle.checked = true;
  const first = toggle.fire('change');
  const steps = control('precise-volume', 'steps');
  steps.value = '2';
  const second = steps.fire('change');
  const up = control('precise-volume', 'globalShortcuts.volumeUp');
  up.value = 'Ctrl+Alt+ArrowUp';
  const third = up.fire('change');
  const notifications = document.getElementById('notifications');
  notifications.checked = true;
  const fourth = notifications.fire('change');
  backend.config.plugins['precise-volume'].savedVolume = 51;
  await Promise.all([first, second, third, fourth]);
  assert.deepEqual(backend.config.plugins['precise-volume'], {
    enabled: true, steps: 2, savedVolume: 51, globalShortcuts: { volumeUp: 'Ctrl+Alt+ArrowUp' },
  });
  assert.equal(backend.config.notifications, true);
  assert.equal(backend.maxPending, 1);
  assert.deepEqual(backend.calls.filter((c) => c.cmd === 'patch_settings')[0].args.patch,
    { plugins: { 'precise-volume': { enabled: true } } });
});

test('a failed save restores the control and does not poison later saves', async () => {
  const { backend, control, ids } = await load();
  backend.failNext = true;
  const toggle = control('precise-volume');
  toggle.checked = true;
  await toggle.fire('change');
  assert.equal(toggle.checked, false);
  assert.equal(backend.config.plugins['precise-volume'].enabled, false);
  assert.equal(ids.status.dataset.error, 'true');
  assert.match(ids.status.textContent, /No se pudo guardar/);
  const steps = control('precise-volume', 'steps');
  steps.value = '3';
  await steps.fire('change');
  assert.equal(backend.config.plugins['precise-volume'].steps, 3);
  assert.equal(ids.status.dataset.error, 'false');
});

test('invalid numeric input does not save, and raw select values survive localization', async () => {
  const { backend, control } = await load();
  const steps = control('precise-volume', 'steps');
  steps.value = '200';
  await steps.fire('change');
  assert.equal(backend.config.plugins['precise-volume'].steps, 1);
  assert.equal(steps.value, 1);
  const palette = control('user-theme', 'preset');
  palette.value = 'forest';
  await palette.fire('change');
  assert.equal(backend.config.plugins['user-theme'].preset, 'forest');
});

test('search ignores accents, categories and enabled-only filters compose, and empty state is visible', async () => {
  const { ids, plugin } = await load();
  ids.search.value = 'ecualizador';
  await ids.search.fire('input');
  assert.equal(plugin('equalizer').hidden, false);
  assert.equal(plugin('precise-volume').hidden, true);
  ids['enabled-only'].checked = true;
  await ids['enabled-only'].fire('change');
  assert.equal(plugin('equalizer').hidden, true);
  assert.equal(ids.empty.hidden, false);
  ids.search.value = 'navegacion';
  ids['enabled-only'].checked = false;
  ids.category.value = 'Appearance';
  await ids.search.fire('input');
  assert.equal(plugin('navigation').hidden, false);
  ids.category.value = 'Sound';
  await ids.category.fire('change');
  assert.equal(plugin('navigation').hidden, true);
});

test('sleep timer uses runtime commands, updates its countdown and cancels without writing preferences', async () => {
  const { backend, document, intervals } = await load();
  const get = (id) => document.getElementById(id);
  assert.equal(get('timer-cancel').disabled, true);
  get('timer-preset').value = '30';
  await get('timer-start').fire('click');
  assert.match(get('timer-countdown').textContent, /^30:00$/);
  assert.equal(get('timer-cancel').disabled, false);
  backend.timer = { ...backend.timer, mode: 'off' };
  intervals[0]();
  await flush();
  assert.equal(get('timer-cancel').disabled, true);
  get('timer-preset').value = 'track';
  await get('timer-start').fire('click');
  assert.equal(get('timer-countdown').textContent, 'Al terminar esta canción');
  await get('timer-cancel').fire('click');
  assert.equal(backend.timer.mode, 'off');
  assert.equal(backend.calls.filter((c) => c.cmd === 'patch_settings').length, 0);
});

test('timer errors are translated and a delayed poll cannot overwrite a newly armed timer', async () => {
  const { backend, document, intervals, ids } = await load();
  const get = (id) => document.getElementById(id);
  backend.timerError = 'Choose a loaded track first.';
  get('timer-preset').value = 'track';
  await get('timer-start').fire('click');
  assert.match(ids.status.textContent, /Elige primero una canción cargada/);
  assert.equal(get('timer-start').disabled, false);
  backend.timerError = null;
  let resolve;
  backend.timerReadDelay = new Promise((done) => { resolve = done; });
  intervals[0]();
  await get('timer-start').fire('click');
  resolve();
  await flush();
  assert.equal(get('timer-countdown').textContent, 'Al terminar esta canción');
});

test('playback shortcut edits are queued field patches, support clearing and require restart', async () => {
  const { backend, document, ids } = await load();
  const play = document.getElementById('shortcut-play_pause');
  const next = document.getElementById('shortcut-next');
  assert.equal(play.value, 'Ctrl+Alt+Space');
  assert.equal(next.value, 'Ctrl+Alt+ArrowRight');
  assert.equal(play.maxLength, 128);
  play.value = '  Ctrl+Alt+P  ';
  const first = play.fire('change');
  next.value = '';
  await Promise.all([first, next.fire('change')]);
  assert.deepEqual(backend.config.media_shortcuts, { play_pause: 'Ctrl+Alt+P', next: '' });
  assert.equal(backend.config.plugins['precise-volume'].savedVolume, 37);
  assert.equal(backend.maxPending, 1);
  assert.match(ids.status.textContent, /Reinicia Mirlo/);
  ids.search.value = 'siguiente cancion';
  await ids.search.fire('input');
  assert.equal(document.getElementById('media-shortcuts').hidden, false);
});

test('native shortcut errors are localized and restore the last saved binding', async () => {
  const { backend, document, ids } = await load();
  const next = document.getElementById('shortcut-next');
  for (const [kind, message] of [
    ['invalid-shortcut', /Atajo no válido/],
    ['duplicate-shortcut', /otra acción activa/],
    ['unavailable-shortcut', /no está disponible/],
    ['shortcut-cleanup-failed', /Reinicia Mirlo antes/],
  ]) {
    backend.saveError = { kind, action: 'Next track',
      ...(kind === 'duplicate-shortcut' ? { other: 'Play / pause' } : {}) };
    next.value = 'Ctrl+Alt+P';
    await next.fire('change');
    assert.equal(next.value, 'Ctrl+Alt+ArrowRight');
    assert.equal(next.disabled, false);
    assert.equal(ids.status.dataset.error, 'true');
    assert.match(ids.status.textContent, message);
    assert.match(ids.status.textContent, /Siguiente canción/);
    if (kind === 'duplicate-shortcut') assert.match(ids.status.textContent, /Reproducir \/ pausar/);
    assert.equal(backend.config.media_shortcuts, undefined);
  }
});
