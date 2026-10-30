// Run with: node --test tools/tests/offline.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../../app/ui/offline.js', import.meta.url), 'utf8');

function screen(fetch) {
  const events = {};
  const navigations = [];
  let interval;
  let timeout;
  const context = {
    fetch, AbortController,
    window: {
      location: { replace: (url) => navigations.push(url) },
      addEventListener: (name, listener) => { events[name] = listener; },
    },
    setInterval: (fn, ms) => { assert.equal(ms, 15000); interval = fn; },
    setTimeout: (fn, ms) => { assert.equal(ms, 8000); timeout = fn; return 1; },
    clearTimeout() {},
  };
  vm.runInNewContext(script, context);
  return { events, navigations, tick: () => interval(), timeout: () => timeout() };
}

test('DNS failure keeps the local screen; recovery navigates to the player', async () => {
  let connected = false;
  const ui = screen(async (url, options) => {
    assert.equal(url, 'https://music.youtube.com/');
    assert.equal(options.mode, 'no-cors');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    if (!connected) throw new TypeError('DNS unavailable');
    return {};
  });
  await ui.tick();
  assert.deepEqual(ui.navigations, []);
  connected = true;
  await ui.events.online();
  assert.deepEqual(ui.navigations, ['https://music.youtube.com/']);
});

test('online events do not overlap an in-flight check; timeout permits a retry', async () => {
  let calls = 0;
  const ui = screen((_, { signal }) => {
    calls++;
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('timeout')));
    });
  });
  const pending = ui.tick();
  await ui.events.online();
  assert.equal(calls, 1);
  ui.timeout();
  await pending;
  assert.deepEqual(ui.navigations, []);
  const retry = ui.tick();
  assert.equal(calls, 2);
  ui.timeout();
  await retry;
});
