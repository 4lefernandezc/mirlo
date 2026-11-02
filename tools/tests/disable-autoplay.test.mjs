import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../app/src-tauri/plugins/disable-autoplay.js', import.meta.url), 'utf8');

function load() {
  let definition;
  const listeners = new Map();
  const document = {
    addEventListener(type, listener, options) {
      listeners.set(type + (options === true ? ':capture' : ''), listener);
    },
    removeEventListener(type, listener, options) {
      listeners.delete(type + (options === true ? ':capture' : ''));
    },
  };
  const context = {
    document,
    __MIRLO_PLUGINS__: {
      register(id, plugin) {
        assert.equal(id, 'disable-autoplay');
        definition = plugin;
      },
    },
  };
  vm.runInNewContext(source, context);
  // The host binds every method to the plugin definition.
  for (const key of Object.keys(definition)) {
    if (typeof definition[key] === 'function') definition[key] = definition[key].bind(definition);
  }
  return { definition, listeners, document };
}

function setup() {
  const { definition, listeners } = load();
  const calls = { apiPause: 0, videoPause: 0 };
  const api = { pauseVideo: () => (calls.apiPause += 1) };
  const video = { pause: () => (calls.videoPause += 1) };
  definition.config = { applyOnce: false };
  definition.onPlayerApiReady(api);
  return { definition, listeners, calls, video };
}

test('an automatic track change is paused and a late auto-start too', () => {
  const { definition, calls, video } = setup();
  definition.eventListener({ detail: { name: 'dataloaded' } });
  assert.equal(calls.apiPause, 1);

  definition.playListener({ target: video });
  assert.equal(calls.videoPause, 1);
});

test('a track the user just clicked is not paused', () => {
  const { definition, calls, video } = setup();
  definition.onInput();
  definition.eventListener({ detail: { name: 'dataloaded' } });
  assert.equal(calls.apiPause, 0);

  definition.playListener({ target: video });
  assert.equal(calls.videoPause, 0);
});

test('input older than the window still lets the next auto track pause', () => {
  const { definition, calls } = setup();
  definition.onInput();
  definition.lastInputAt = Date.now() - 2000;
  definition.eventListener({ detail: { name: 'dataloaded' } });
  assert.equal(calls.apiPause, 1);
});

test('applyOnce stops observing track changes after the first one', () => {
  const { definition, listeners } = setup();
  definition.config = { applyOnce: true };
  definition.eventListener({ detail: { name: 'dataloaded' } });
  assert.equal(listeners.has('videodatachange'), false);
});

test('stop removes every listener', () => {
  const { definition, listeners } = setup();
  assert.equal(listeners.has('play:capture'), true);
  assert.equal(listeners.has('pointerdown:capture'), true);
  definition.stop();
  assert.equal(listeners.size, 0);
});
