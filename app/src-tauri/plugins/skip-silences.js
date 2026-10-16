/*
 * Mirlo plugin: skip-silences
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/skip-silences/index.ts + renderer.ts
 * Adapted to the Mirlo plugin host: `ytmd:audio-can-play` is dispatched by
 * the bridge's audio provider (declared with `audio: true`), which follows
 * upstream's renderer-core event shape `{ audioContext, audioSource }`.
 */
__MIRLO_PLUGINS__.register('skip-silences', {
  defaults: { enabled: false, onlySkipBeginning: false },
  audio: true,

  SMOOTHING: 0.1,
  THRESHOLD: -100, // DB (-100 = absolute silence, 0 = loudest)
  INTERVAL: 2, // Ms
  HISTORY: 10,

  config: null,
  isSilent: false,
  hasAudioStarted: false,
  speakingHistory: null,
  playOrSeekHandler: null,

  getMaxVolume(analyser, fftBins) {
    let maxVolume = Number.NEGATIVE_INFINITY;
    analyser.getFloatFrequencyData(fftBins);

    for (let i = 4, ii = fftBins.length; i < ii; i++) {
      if (fftBins[i] > maxVolume && fftBins[i] < 0) {
        maxVolume = fftBins[i];
      }
    }

    return maxVolume;
  },

  skipSilence() {
    if (this.config.onlySkipBeginning && this.hasAudioStarted) {
      return;
    }

    const video = document.querySelector('video');
    if (this.isSilent && video && !video.paused) {
      video.currentTime += 0.2; // In s
    }
  },

  audioCanPlayListener(e) {
    const video = document.querySelector('video');
    const { audioContext } = e.detail;
    const sourceNode = e.detail.audioSource;

    // Use an audio analyser similar to Hark
    // https://github.com/otalk/hark/blob/master/hark.bundle.js
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = this.SMOOTHING;
    const fftBins = new Float32Array(analyser.frequencyBinCount);

    sourceNode.connect(analyser);

    const looper = () => {
      setTimeout(() => {
        const currentVolume = this.getMaxVolume(analyser, fftBins);

        let history = 0;
        if (currentVolume > this.THRESHOLD && this.isSilent) {
          // Trigger quickly, short history
          for (let i = this.speakingHistory.length - 3; i < this.speakingHistory.length; i++) {
            history += this.speakingHistory[i];
          }

          if (history >= 2) {
            // Not silent
            this.isSilent = false;
            this.hasAudioStarted = true;
          }
        } else if (currentVolume < this.THRESHOLD && !this.isSilent) {
          for (const element of this.speakingHistory) {
            history += element;
          }

          if (
            history == 0 && // Silent
            !(
              video &&
              (video.paused || video.seeking || video.ended || video.muted || video.volume === 0)
            )
          ) {
            this.isSilent = true;
            this.skipSilence();
          }
        }

        this.speakingHistory.shift();
        this.speakingHistory.push(Number(currentVolume > this.THRESHOLD));

        looper();
      }, this.INTERVAL);
    };

    looper();

    this.playOrSeekHandler = () => {
      this.hasAudioStarted = false;
      this.skipSilence();
    };

    video?.addEventListener('play', this.playOrSeekHandler);
    video?.addEventListener('seeked', this.playOrSeekHandler);
  },

  async start(ctx) {
    this.config = await ctx.getConfig();
    this.isSilent = false;
    this.hasAudioStarted = false;
    this.speakingHistory = Array.from({ length: this.HISTORY }).fill(0);

    document.addEventListener('ytmd:audio-can-play', this.audioCanPlayListener, {
      passive: true,
    });
  },

  stop() {
    document.removeEventListener('ytmd:audio-can-play', this.audioCanPlayListener);

    if (this.playOrSeekHandler) {
      const video = document.querySelector('video');
      video?.removeEventListener('play', this.playOrSeekHandler);
      video?.removeEventListener('seeked', this.playOrSeekHandler);
    }
  },
});
