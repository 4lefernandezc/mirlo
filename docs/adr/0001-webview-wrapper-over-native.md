# ADR-0001: WebView2 wrapper over a fully native client (for v1)

- Status: Accepted (2026-10-16)
- Deciders: project owner + agent session

## Context

The goal is a fast, resource-light, open-source desktop client for YouTube
Music. Two viable architectures:

1. **Web wrapper**: host the official web player in a system webview
   (WebView2) with native shell features and injected enhancements.
2. **Fully native client**: own UI + official-service data access via
   undocumented inner APIs (InnerTube) + own audio pipeline (e.g. mpv),
   stream URLs extracted like downloaders do.

Constraints and priorities given by the owner:

- Minimize (not maximize) exposure to each platform's terms of service.
- Public repository for the general public; must be a defensible, durable
  project.
- Resource consumption is the primary motivation for building it.

Phase 0 data (see `../research/measurements.md`): the wrapper shell measured
~399 MB private vs ~1179 MB for the Electron build of the reference app —
already a large win.

## Decision

V1 is a **WebView2/Tauri wrapper of the official player**. A fully native
playback client is explicitly **not** pursued in v1 and is gated behind a new
risk review if ever revisited.

## Rationale

- The wrapper plays content through the official player with the user's own
  session: no stream extraction, no DRM bypass, no downloading. It behaves as a
  dedicated browser. This is the most defensible posture against ToS concerns.
- InnerTube-based playback is precisely the behavior platforms actively
  pursue, contradicting the owner's "minimize infringement" priority.
- The wrapper keeps full feature parity with the official player (library,
  recommendations, lyrics, radio) without reimplementing the product.
- The wrapper still delivers a large, measurable resource win over
  Electron-based alternatives.

## Consequences

- A memory floor of roughly 300–450 MB (the web app itself is heavy); this is
  accepted and documented. Sub-200 MB would require architecture 2.
- Optimization work stays within the shell (audio-only mode, GPU flags,
  throttling) — tracked in Phase E of the roadmap.
- The project remains a candidate to be less vulnerable to service/API churn
  (the player page is the stable interface).
