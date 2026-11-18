import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const bridge = readFileSync(new URL('../../app/src-tauri/src/bridge.js', import.meta.url), 'utf8');
const start = bridge.indexOf('  function makePluginContext(id)');
const end = bridge.indexOf('\n  function ', start + 10);
assert(start >= 0 && end > start);

test('plugin contexts send only changed fields and adopt the latest shell configuration', async () => {
  const calls = [];
  const backend = {
    plugins: { 'precise-volume': {
      enabled: false, globalShortcuts: { volumeUp: 'Ctrl+Alt+P' }, savedVolume: 42,
    } },
  };
  const context = vm.runInNewContext(`
    let config = {plugins: {'precise-volume': {
      enabled: true, globalShortcuts: {volumeUp: 'Ctrl+Alt+ArrowUp'}, savedVolume: 37
    }}};
    const effectivePluginConfig = (id) => config.plugins[id];
    const refreshConfig = async () => {};
    const pluginRegistry = new Map();
    const isPluginEnabled = () => true;
    ${bridge.slice(start, end)}
    makePluginContext('precise-volume');
  `, {
    console,
    invoke: async (command, args) => {
      calls.push(JSON.parse(JSON.stringify({ command, args })));
      return backend;
    },
  });
  const merged = await context.setConfig({ savedVolume: 42 });
  assert.deepEqual(calls, [{
    command: 'set_plugin_config', args: { pluginId: 'precise-volume', config: { savedVolume: 42 } },
  }]);
  assert.equal(merged.enabled, false);
  assert.equal(merged.globalShortcuts.volumeUp, 'Ctrl+Alt+P');
  assert.equal(merged.savedVolume, 42);
});
