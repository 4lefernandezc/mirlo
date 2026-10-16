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
