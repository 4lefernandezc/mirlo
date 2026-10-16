# Security Policy

## Supported versions

Mirlo is in early development; only the latest `main` branch is supported.
There are no released versions yet.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report privately to:

**luigiferca@gmail.com**

Include:

- A description of the issue and its impact.
- Steps to reproduce (minimal proof of concept if possible).
- Affected commit/version and platform.

You can expect an acknowledgement within 72 hours and a resolution plan within
14 days for confirmed issues.

## Scope notes

Mirlo is a local desktop application that hosts the official YouTube Music web
player in an embedded WebView. Areas of special interest:

- Injection/bridge scripts (privilege boundaries between the remote page and
  the native shell).
- WebView2 profile/session handling (cookie and credential storage).
- Any path that could let remote page content escape its sandbox or reach
  native commands it should not.

Vulnerabilities in the YouTube Music web service itself are out of scope and
should be reported to Google.
