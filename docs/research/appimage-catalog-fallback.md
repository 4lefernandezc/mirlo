# AppImage catalog: incomplete 0.1.11 fallback

Date: 2026-11-02. Local correction, not a release.

## Actual catalog failure

PR: https://github.com/AppImage/appimage.github.io/pull/10937

Run `41494406860`, job `125445449766`, tested the published 0.1.11 AppImage.
The relevant sequence is:

```text
mirlo: WebKit sandbox unavailable here; continuing without it
bwrap: Can't mount proc on /newroot/proc: Operation not permitted
readPIDFromPeer: Unexpected short read from PID socket
ERROR: The application exited within 11 seconds instead of showing a window
```

The catalog launches with Firejail `--noprofile --net=none --appimage` and
software rendering. Lack of network is intentional, not the crash cause.

Two mistakes in the previous correction:

1. `assemble.py` only omitted `WEBKIT_FORCE_SANDBOX=1` on failure. That did
   not explicitly disable WebKit's sandbox, or clear an inherited force flag.
2. `lib.rs::run()` then unconditionally removed the disable flag and set
   `WEBKIT_FORCE_SANDBOX=1`, overriding the launcher anyway.

Inspecting AppRun and testing its probe with a stub did not exercise this
launcher-to-Rust-to-WebKit interaction. Earlier documentation claiming a
working fallback has been corrected.

## Minimal correction

- Probe succeeds: clear the disable flag and force the sandbox.
- Probe fails: clear the force flag and export
  `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1` with the existing warning.
- Rust startup preserves an explicit disable value of `1` and clears the
  conflicting force flag. Otherwise it still clears invalid disable values
  and forces the sandbox, before GTK or worker threads start.
- `.deb`/source builds still default to forced sandboxing; they do not run
  the AppImage probe. An explicit standard WebKit disable override is now
  honored by Rust as well.

No dependency, IPC, version bump, release change or GitHub write.

## Runtime verification

Built the current Rust source in an isolated Ubuntu 22.04 userspace. A local
candidate replaces only Mirlo's executable and the generated AppRun in an
extracted 0.1.11 image, then repacks it with `tools/linux/repack.py`. All
bundled WebKit/media/helpers remain from the published image. The AppRun is
generated from the actual assembly code, not an independently written fix.

Candidate: 80,710,136 bytes, SHA-256
`f86c2bccc9775939d82b77dff4dada78b43ab0c89365fba76fe188634c36e9d5`.
Executable SHA-256:
`5a5ca77bd8226a837097fc7f646167c2328aafcd6282e192a6e8415474521377`.
It still reports 0.1.11; this is an unsigned test candidate, not a new asset.

Each test uses a fresh signed-out profile, Xvfb at 1280x800, software
rendering, a private mount/PID/user/network namespace, no network interface
other than loopback, and no manually supplied WebKit sandbox override.
The restricted test adds a seccomp filter returning `EPERM` for `mount(2)`
(x86_64 syscall 165), denying nested bubblewrap mounts. This exercises the
same unavailable-sandbox condition, not the exact Firejail policy.

| Input | Nested mounts | Result |
| --- | --- | --- |
| Published 0.1.11, extracted | Allowed | Offline screen renders |
| Published 0.1.11, extracted | Denied | Fallback warning, then fatal dbus-proxy/bwrap failure; no WebProcess |
| Corrected complete candidate, `--appimage-extract-and-run` | Denied | Fallback chosen automatically; offline screen renders; app and WebProcess stay alive |
| Corrected complete candidate, `--appimage-extract-and-run` | Allowed | Offline screen renders; WebProcess has Seccomp 2 and separate mount/PID/network namespaces from the UI |

Both positive candidate screenshots were reviewed: the main content is the
light local recovery screen, with "Connect Mirlo to the internet" and
"Try again", not a blank window. Logs show `ready`, MPRIS registration and
the expected DNS failure. Restricted stderr contains the fallback warning
but no bubblewrap/auxiliary-process fatal error. The runtime assertion waits
eight seconds after the main window appears and requires a live WebProcess.
In the restricted run, inherited Seccomp 2 is the **outer test filter**, not
proof of WebKit sandboxing; that renderer intentionally has no inner sandbox.

Temporary evidence (not committed):

- `$env:TEMP\opencode\appimage-clean-test\catalog-{original-restricted,normal,full-restricted,full-normal}\`:
  stderr, window IDs, process/namespace snapshots, logs and screenshots.
- `$env:TEMP\opencode\catalog-{build,prepare,finalize,runtime}.sh` and
  `catalog-runtime.py`: local construction and runtime harness.
- `catalog-stage-path.txt` in that results directory locates the candidate
  on the WSL Linux filesystem.

## Regression checks

- Nine Python packaging tests (new test executes the actual generated
  launcher, testing successful/failed probes with conflicting inherited
  variables) and one existing bubblewrap-wrapper test pass.
- Linux release build and Rust tests: 33 pass; one child-only helper is
  marked ignored for the default suite and invoked by the parent regression
  test in three isolated subprocesses (absent, `0`, `1` disable values).
- Windows fmt/Clippy and 32 Rust tests pass; 14 renderer Node tests pass.
- Linux builds retain the pre-existing unused-code/import warnings; Linux
  Clippy was not run.

## Limits / release gate

This is local WSL validation with an equivalent mount-denial restriction,
not the catalog's exact Firejail/kernel or a fresh CI-built release. No new
FUSE, signed-in playback or hardware checks. A new release needs owner
authorization, final artifact/signature/source verification, runtime checks
of that exact artifact and then catalog `/retest`.

On restricted hosts the fallback deliberately loses WebKit renderer
isolation. It does not bypass or remove the host's outer sandbox. Normal
launches must continue to pass the isolation assertions.
