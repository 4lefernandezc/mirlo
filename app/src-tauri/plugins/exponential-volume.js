/*
 * Mirlo plugin: exponential-volume
 *
 * Ported from pear-desktop v3.11.0 (MIT, © 2021-2024 th-ch and pear-devs):
 *   src/plugins/exponential-volume/index.ts
 * Adapted to the Mirlo plugin host. Deviation: the volume accessor is made
 * configurable and `stop()` restores the original descriptor (upstream has
 * no unload path; restartNeeded: true there).
 */
__MIRLO_PLUGINS__.register('exponential-volume', {
  defaults: { enabled: false },

  // Manipulation exponent, higher value = lower volume
  // 3 is the value used by pulseaudio, which Barteks2x figured out this gist here: https://gist.github.com/Barteks2x/a4e189a36a10c159bb1644ffca21c02a
  // 0.05 (or 5%) is the lowest you can select in the UI which with an exponent of 3 becomes 0.000125 or 0.0125%
  EXPONENT: 3,

  originalDescriptor: null,

  onPlayerApiReady(playerApi) {
    const syncVolume = (api) => {
      if (api.getPlayerState() === 3) {
        setTimeout(() => syncVolume(api), 0);
        return;
      }

      api.setVolume(api.getVolume());
    };

    // "YouTube Music fix volume ratio 0.4" by Marco Pfeiffer
    // https://greasyfork.org/en/scripts/397686-youtube-music-fix-volume-ratio/
    const exponent = this.EXPONENT;
    const storedOriginalVolumes = new WeakMap();
    this.originalDescriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      'volume'
    );
    const propertyDescriptor = this.originalDescriptor;
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      get() {
        const lowVolume = (propertyDescriptor?.get?.call(this) ?? 0);
        const calculatedOriginalVolume = lowVolume ** (1 / exponent);

        // The calculated value has some accuracy issues which can lead to problems for implementations that expect exact values.
        // To avoid this, I'll store the unmodified volume to return it when read here.
        // This mostly solves the issue, but the initial read has no stored value and the volume can also change though external influences.
        // To avoid ill effects, I check if the stored volume is somewhere in the same range as the calculated volume.
        const storedOriginalVolume = storedOriginalVolumes.get(this) ?? 0;
        const storedDeviation = Math.abs(storedOriginalVolume - calculatedOriginalVolume);

        return storedDeviation < 0.01 ? storedOriginalVolume : calculatedOriginalVolume;
      },
      set(originalVolume) {
        const lowVolume = originalVolume ** exponent;
        storedOriginalVolumes.set(this, originalVolume);
        propertyDescriptor?.set?.call(this, lowVolume);
      },
    });
    syncVolume(playerApi);
  },

  stop() {
    if (this.originalDescriptor) {
      Object.defineProperty(HTMLMediaElement.prototype, 'volume', this.originalDescriptor);
      this.originalDescriptor = null;
    }
  },
});
