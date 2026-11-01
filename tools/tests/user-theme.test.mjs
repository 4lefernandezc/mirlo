import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../app/src-tauri/plugins/user-theme.js', import.meta.url), 'utf8');

class FakeSheet {
  constructor() {
    this.css = '';
  }
  replaceSync(css) {
    this.css = css;
  }
}

function fakeStyle(initial = []) {
  const props = new Set(initial);
  return {
    *[Symbol.iterator]() {
      yield* props;
    },
    removeProperty(name) {
      props.delete(name);
    },
    setProperty(name) {
      props.add(name);
    },
    has(name) {
      return props.has(name);
    },
  };
}

function load(extra = {}) {
  let definition;
  const rootStyle = fakeStyle([
    '--yt-spec-base-background',
    '--ytmusic-color-black1',
    '--ytmusic-player-page-inner-height',
  ]);
  const bodyStyle = fakeStyle(['background']);
  const document = {
    adoptedStyleSheets: [],
    documentElement: { style: rootStyle },
    body: extra.body === null ? null : { style: bodyStyle },
  };
  const context = {
    document,
    window: {},
    CSSStyleSheet: FakeSheet,
    __MIRLO_PLUGINS__: {
      register(id, plugin) {
        assert.equal(id, 'user-theme');
        definition = plugin;
      },
    },
    ...extra,
  };
  vm.runInNewContext(source, context);
  return { definition, document, rootStyle, bodyStyle, window: context.window };
}

test('remote imports and url() references are stripped', () => {
  const { definition } = load();
  const css = definition.stripRemoteRefs(
    '@import url("https://evil.example/x.css");\n' +
      'body { background: url(https://evil.example/p.png); }\n' +
      '.ok { background: url("data:image/png;base64,AA"); }'
  );
  assert.equal(css.includes('@import'), false);
  assert.equal(css.includes('https://'), false);
  assert.equal(css.includes('data:image/png'), true);
});

test('start applies the palette then the user css, and stop removes the sheet', async () => {
  const { definition, document, rootStyle, bodyStyle, window } = load();
  await definition.start({
    getConfig: async () => ({ preset: 'midnight', customCss: 'body { color: red; }' }),
  });

  assert.equal(document.adoptedStyleSheets.length, 1);
  // A flat preset also disables the album-color inline overrides.
  assert.equal(window.__MIRLO_FLAT_THEME__, true);
  assert.equal(rootStyle.has('--yt-spec-base-background'), false);
  assert.equal(rootStyle.has('--ytmusic-color-black1'), false);
  assert.equal(rootStyle.has('--ytmusic-player-page-inner-height'), true);
  assert.equal(bodyStyle.has('background'), false);

  const css = document.adoptedStyleSheets[0].css;
  assert.ok(css.includes('--yt-spec-base-background: #0b1220 !important;'));
  assert.ok(css.indexOf('body { color: red; }') > css.indexOf('--yt-spec-base-background'));

  definition.stop();
  assert.equal(document.adoptedStyleSheets.length, 0);
  assert.equal(document.adoptedStyleSheets[0], undefined);
  assert.equal(window.__MIRLO_FLAT_THEME__, false);
});

test('the native palette leaves the album-color plugin alone', async () => {
  const { definition, window, rootStyle } = load();
  await definition.start({ getConfig: async () => ({ preset: 'native', customCss: '' }) });
  assert.equal(window.__MIRLO_FLAT_THEME__, false);
  assert.equal(rootStyle.has('--yt-spec-base-background'), true);
  definition.stop();
});

test('the boot config applies the theme before the host starts plugins', () => {
  const { document, window } = load({
    window: { __MIRLO_BOOT__: { config: { plugins: { 'user-theme': { preset: 'amoled' } } } } },
  });
  assert.equal(document.adoptedStyleSheets.length, 1);
  assert.ok(document.adoptedStyleSheets[0].css.includes('#000000'));
  assert.equal(window.__MIRLO_FLAT_THEME__, true);
});

test('the boot apply tolerates a missing <body>', () => {
  const { document } = load({
    body: null,
    window: { __MIRLO_BOOT__: { config: { plugins: { 'user-theme': { preset: 'midnight' } } } } },
  });
  assert.equal(document.adoptedStyleSheets.length, 1);
});

test('a disabled theme is not applied at boot', () => {
  const { document } = load({
    window: {
      __MIRLO_BOOT__: {
        config: { plugins: { 'user-theme': { enabled: false, preset: 'amoled' } } },
      },
    },
  });
  assert.equal(document.adoptedStyleSheets.length, 0);
});
