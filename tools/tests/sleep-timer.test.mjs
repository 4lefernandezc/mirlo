import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const bridge = readFileSync(new URL('../../app/src-tauri/src/bridge.js', import.meta.url), 'utf8');
const start = bridge.indexOf('  function createSleepTimer()');
const end = bridge.indexOf('  // --- Shell API surface', start);
assert(start >= 0 && end > start);

function load() {
  const listeners = new Map();
  const reports = [];
  const video = { paused: false, pauses: 0, pause() { this.paused = true; this.pauses++; } };
  const state = { videoId: 'song', isAd: false };
  let active = video;
  let now = 10_000;
  const timer = vm.runInNewContext(`${bridge.slice(start, end)}\ncreateSleepTimer()`, {
    findVideo: () => active,
    q: () => ({ pauseVideo() { video.paused = true; } }),
    player: { state: () => state },
    report: (kind, data) => reports.push({ kind, timerId: data.timerId }),
    Date: { now: () => now },
    document: { addEventListener(type, handler, capture) { listeners.set(type, { handler, capture }); } },
  });
  const emit = (type, event = {}) => listeners.get(type).handler({ type, target: active, ...event });
  return { timer, video, state, reports, listeners, emit,
    setActive: (value) => { active = value; }, advance: (ms) => { now += ms; } };
}

test('end-of-track is caught in capture and blocks a late automatic next play', () => {
  const { timer, video, reports, listeners, emit } = load();
  timer.configure({ id: 1, mode: 'track', videoId: 'song' });
  assert.equal(listeners.get('ended').capture, true);
  emit('ended');
  assert.equal(video.paused, true);
  assert.deepEqual(reports, [{ kind: 'sleep-timer-ended', timerId: 1 }]);
  video.paused = false;
  emit('play');
  assert.equal(video.paused, true);
  timer.configure({ id: 1, mode: 'expired' });
  assert.deepEqual(reports.at(-1), { kind: 'sleep-timer-paused', timerId: 1 });
});

test('ads, another track and preloaded videos do not finish the selected track timer', () => {
  const { timer, video, state, reports, emit } = load();
  timer.configure({ id: 1, mode: 'track', videoId: 'song' });
  state.isAd = true;
  emit('ended');
  state.isAd = false;
  state.videoId = 'other';
  emit('ended');
  state.videoId = 'song';
  emit('ended', { target: { pause() { throw new Error('Preloaded video must be ignored'); } } });
  assert.equal(video.pauses, 0);
  assert.equal(reports.length, 0);
});

test('expiration pauses immediately; trusted page input and shell controls allow the next play', () => {
  const { timer, video, emit } = load();
  timer.configure({ id: 1, mode: 'expired' });
  emit('pointerdown', { isTrusted: false });
  video.paused = false;
  emit('play');
  assert.equal(video.paused, true, 'synthetic input must not release the guard');
  emit('keydown', { isTrusted: true });
  video.paused = false;
  emit('play');
  assert.equal(video.paused, false);
  timer.configure({ id: 2, mode: 'expired' });
  emit('mirlo:user-intent');
  video.paused = false;
  emit('play');
  assert.equal(video.paused, false);
});

test('cancellation or replacement rejects stale expiration and clears the old guard', () => {
  const { timer, video, emit } = load();
  timer.configure({ id: 1, mode: 'expired' });
  const before = video.pauses;
  timer.configure({ id: 2, mode: 'off' });
  timer.configure({ id: 1, mode: 'expired' });
  video.paused = false;
  emit('play');
  assert.equal(video.pauses, before);
  assert.equal(video.paused, false);
});

test('a missing media element does not acknowledge a pause; a later retry can pause it', () => {
  const { timer, video, reports, setActive } = load();
  setActive(null);
  timer.configure({ id: 1, mode: 'expired' });
  assert.equal(reports.length, 0);
  setActive(video);
  timer.configure({ id: 1, mode: 'expired' });
  assert.equal(video.paused, true);
  assert.equal(reports[0].kind, 'sleep-timer-paused');
});

test('the late-start guard is bounded, not a permanent block on playback', () => {
  const { timer, video, advance, emit } = load();
  timer.configure({ id: 1, mode: 'expired' });
  advance(4001);
  video.paused = false;
  emit('play');
  assert.equal(video.paused, false);
});
