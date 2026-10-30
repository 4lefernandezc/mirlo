// Probe the actual player host: navigator.onLine alone misses DNS failures.
(() => {
  const playerUrl = 'https://music.youtube.com/';
  let checking = false;

  async function checkConnection() {
    if (checking) return;
    checking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      await fetch(playerUrl, {
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      });
      window.location.replace(playerUrl);
    } catch (_) {
      // Stay on the readable local screen until the next check or manual retry.
    } finally {
      clearTimeout(timeout);
      checking = false;
    }
  }

  window.addEventListener('online', checkConnection);
  setInterval(checkConnection, 15000);
})();
