/*
 * Mirlo plugin: equalizer
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/equalizer/index.ts + presets.ts
 * Adapted to the Mirlo plugin host (filters are applied through the host's
 * `ytmd:audio-can-play` audio provider). Upstream v3.11.0 ships a
 * config-based equalizer (custom `filters` + the `bass-booster` preset);
 * the sliders UI of older upstream versions is not part of v3.11.0.
 */
__MIRLO_PLUGINS__.register('equalizer', {
  defaults: {
    enabled: false,
    filters: [],
    presets: { 'bass-booster': false },
  },
  audio: true,

  DEFAULT_PRESETS: ['bass-booster'],
  PRESET_CONFIGS: {
    'bass-booster': {
      type: 'lowshelf',
      frequency: 80,
      Q: 100,
      gain: 12.0,
    },
  },

  appliedFilters: [],

  async start(ctx) {
    this.ctx = ctx;
    const config = await ctx.getConfig();
    this.config = config;

    // Upstream listens for the (once) `ytmd:audio-can-play` event; the
    // Mirlo host may wire the audio graph before this plugin starts, so use
    // the race-free accessor instead (resolves as soon as the graph exists).
    const { audioSource, audioContext } = await window.__MIRLO_PLUGINS__.audio();

    const filtersToApply = config.filters.concat(
      this.DEFAULT_PRESETS.filter((preset) => config.presets[preset]).map(
        (preset) => this.PRESET_CONFIGS[preset]
      )
    );
    filtersToApply.forEach((filter) => {
      const biquadFilter = audioContext.createBiquadFilter();
      biquadFilter.type = filter.type;
      biquadFilter.frequency.value = filter.frequency; // filter frequency in Hz
      biquadFilter.Q.value = filter.Q;
      biquadFilter.gain.value = filter.gain; // filter gain in dB

      audioSource.connect(biquadFilter);
      biquadFilter.connect(audioContext.destination);

      this.appliedFilters.push(biquadFilter);
    });
  },

  stop() {
    this.appliedFilters.forEach((filter) => filter.disconnect());
    this.appliedFilters = [];
  },
});
