# ADR-0003: Terms-of-service posture, branding and default feature policy

- Status: Accepted (2026-10-16)

## Context

The project is public and mirrors a proprietary service's web client. The owner
wants to minimize legal exposure and follow a standard open-source posture.

## Decisions

1. **Playback path**: only the official player with the user's own session.
   No stream extraction, no InnerTube playback, no DRM bypass, no media
   downloading — in the app or in shipped plugins.
2. **Downloader plugin**: not ported (upstream `downloader` is excluded).
3. **Ad-block**: ships **disabled by default** and is documented as an
   optional, user-enabled enhancement. (Upstream default: enabled.)
4. **Age-restriction bypass, and similar service-modifying plugins**: held
   pending review; not in the default set.
5. **Branding**: project name ("Mirlo") is neutral — no "YouTube" in the
   product name, repo name, or iconography. Descriptive references to YouTube
   Music are allowed for identification only.
6. **Disclaimers**: README and About screen carry a no-affiliation disclaimer
   in the style of the reference project.
7. **Telemetry**: none. No analytics, no remote logging.

## Consequences

- Feature debates default to the conservative option when ToS exposure is
  unclear; deviations require a documented review (new ADR).
- The downstream community may fork to add excluded functionality; upstream
  will not merge it.

## Addendum (2026-10-16)

- **crossfade is excluded** from the Phase B ports: the upstream plugin fades
  the next track by fetching its stream URL through InnerTube
  (`youtubei.js` → `getBasicInfo().streaming_data`) and playing it with
  Howler. That is stream extraction under decision 1, so Mirlo does not port
  it (same category as `downloader`). See `THIRD_PARTY_NOTICES.md` and
  `research/plugin-inventory.md`.

## Addendum 2 (2026-10-17): ad-block v2 — response pruning

- The network-level ad-block (v1) answers ad-endpoint requests with a
  synthesized 403, but YouTube Music *announces* audio ads inside the
  `/youtubei/v1/player` response (`playerAds`, `adPlacements`, `adSlots`)
  and serves their audio as regular streams — URL blocking alone cannot
  stop them (the owner heard audio ads between tracks with v1 active).
- Ad-block v2 therefore also **prunes those keys from the player response**
  in the bridge (the same technique as uBlock Origin's `json-prune` filters
  on YouTube; implemented independently, no code copied). This modifies
  what the official player receives, not how playback works: no stream
  extraction, no InnerTube playback, no DRM handling — the same policy
  category as request blocking.
- The setting remains **OFF by default** (decision 3 unchanged); the prune
  is gated by the same live `config.adblock` flag as v1.
