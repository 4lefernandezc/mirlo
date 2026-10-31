import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../app/src-tauri/plugins/precise-volume.js', import.meta.url), 'utf8');

test('wheel on the volume slider uses one precise step after a global hotkey', () => {
  let definition;
  let volume = 40;
  const changes = [];
  const listeners = [];
  const document = {
    addEventListener(type, listener, options) {
      listeners.push({ type, listener, options });
    },
    removeEventListener(type, listener, capture) {
      listeners.push({ removed: true, type, listener, capture });
    },
    querySelector() {
      return null;
    },
  };
  const context = {
    document,
    __MIRLO_PLUGINS__: {
      register(id, plugin) {
        assert.equal(id, 'precise-volume');
        definition = plugin;
      },
    },
  };
  vm.runInNewContext(source, context);

  const plugin = Object.assign(Object.create(definition), {
    handlers: {},
    options: { steps: 1 },
    api: { getVolume: () => volume },
    setVolume(value) {
      volume = value;
      changes.push(value);
    },
  });
  plugin.setupSliderWheelCapture();

  const registration = listeners.find((item) => item.type === 'wheel');
  assert.equal(registration.options.capture, true);
  assert.equal(registration.options.passive, false);

  // The shell's Ctrl+Alt shortcut and the slider wheel both use changeVolume.
  plugin.changeVolume(true);
  let prevented = false;
  let stopped = false;
  registration.listener({
    deltaY: -100,
    composedPath: () => [{ id: 'volume-slider' }, { id: 'ytmusic-player-bar' }],
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { stopped = true; },
  });

  assert.deepEqual(changes, [41, 42]);
  assert.equal(prevented, true);
  assert.equal(stopped, true);

  const count = changes.length;
  registration.listener({
    deltaY: -100,
    composedPath: () => [{ id: 'ytmusic-player-bar' }],
    preventDefault() { throw new Error('unrelated wheel should pass through'); },
    stopImmediatePropagation() { throw new Error('unrelated wheel should pass through'); },
  });
  assert.equal(changes.length, count);

  plugin.stop();
  assert.ok(listeners.some((item) =>
    item.removed && item.listener === registration.listener && item.capture === true
  ));
});
