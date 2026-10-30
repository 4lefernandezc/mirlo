# Sandbox-enabled local AppImage — 2026-10-30

## Scope and artifact

Follow-up to the [failed sandbox check](appimage-final-tests.md). The new
local candidate includes the missing helpers and corrects the relocated
filesystem view without changing WebKit's seccomp filter or namespace
arguments. Production packaging/workflows remain unchanged; nothing has
been signed, pushed or released.

- File: `$env:TEMP\opencode\appimage-clean-test\sandbox-relocated\Mirlo_multimedia_experimental_x86_64.AppImage`.
- Size: **80,439,800 bytes**, 36,864 bytes above the multimedia-only candidate.
- SHA-256: `0e1e50ee59fb8ffbde5edd10bfc6b8aa084bf30b5ea174077d87dfe2bc97cd30`.
- Mirlo executable remains the published **0.1.8**; offline recovery is
  still not included in this packaging-control experiment.
- Fresh assembly from the original AppDir: all **45 multimedia ELF hashes
  match** the earlier candidate, and `cmp` confirms unchanged Mirlo.
  Adds two helper ELFs (47 additions total) and a small shell adapter.

## Root causes and minimal correction

The packaged WebKitGTK is **2.50.4**. `linuxdeploy` rewrites `/usr/...`
strings to `././/...`, including WebKit's helper executables and sandbox
mount arguments, not only resource lookup paths. Three separate issues:

1. `usr/bin/bwrap` and `usr/bin/xdg-dbus-proxy` were absent.
2. Merely copying them did not work: sandbox mount paths rewritten from
   `/usr/lib*` collided with standard `/lib*` locations, hiding the system
   ELF loader/glibc. The proxy then failed with `execvp ... No such file`.
3. AppDir paths under `/tmp` must be rebound **after** WebKit's private
   `/tmp` mount, and relative helper paths need the AppDir's `usr` cwd.

The experimental assembly now copies Ubuntu 22.04 `bubblewrap`
**0.6.1-1ubuntu0.3** as `usr/bin/bwrap.real` and `xdg-dbus-proxy`
**0.1.3-1ubuntu0.1**. Their dependencies are already in the base image;
the dependency walk still checks for missing entries. Helpers use
`$ORIGIN/../lib`, mode **0755**, no setuid, and preserve package copyright
notices. The AppRun launcher sets `WEBKIT_FORCE_SANDBOX=1`.

`tools/tests/appimage-candidate/bwrap` is a narrow relocation adapter:

- Passes non-serialized calls (e.g. container capability checks) directly
  to the real helper.
- Preserves WebKit's `--args` FD and command arguments verbatim, including
  seccomp/namespace controls. It does not parse or modify the sealed FD.
- After those arguments, restores upstream WebKit's **read-only standard
  library/share mounts**, then mounts **only the AppDir read-only** at its
  real path and selects its `usr` working directory.
- Does **not** bind `/`, the personal home or profile into the renderer;
  does not enable WebKit debug permissions or disable its sandbox.

This is specific to the tested linuxdeploy/WebKit layout, not a general
sandbox implementation or a security certification. A new engine/packager
version must be revalidated. Standard OS library/data paths are the ones
the upstream sandbox already intended to expose, not a new full-host bind.

Reference source used to understand the policy (not modified or copied):
[WebKit 2.50.4 BubblewrapLauncher.cpp](https://github.com/WebKit/WebKit/blob/webkitgtk-2.50.4/Source/WebKit/UIProcess/Launcher/glib/BubblewrapLauncher.cpp).
Upstream intentionally leaves the NetworkProcess trusted; the assertions
below concern the **WebProcess**, not every process in Mirlo's tree.

## Verified against the complete image in clean Debian userspace

The saved assembly/packing recipes produced the identified image, not just
an ad hoc extracted directory. It runs in the previous Debian 12 clean
root without host GTK/WebKit/GStreamer packages.

| Check | Observed |
| --- | --- |
| WebProcess seccomp | `Seccomp: 2`, `NoNewPrivs: 1` |
| Namespaces | WebProcess mount/PID/network namespaces differ from the UI process |
| Private marker | A test file outside permitted paths is visible to the UI but absent from the WebProcess's filesystem |
| UI positive control | `Seccomp: 0`, marker readable; avoids crediting only outer Bubblewrap isolation |
| Real playback | Panama **14.066208 → 27.17695 s**, unpaused, `ad=false`, no media error |
| Seek | 90 s request → **93.852318 s** |
| Next | Ain't Talkin' 'Bout Love, **228 s**, playing after ads finished normally |
| Remote IPC | `get_config` succeeds and returns the expected typed field |

### Prolonged run without the inspector

Repeated playback with **no inspector enabled or attached**. The dedicated
test profile resumed the known official track; MPRIS `SetPosition` was used
once to start at 0, then only `GetAll` observations were made every 10 s.
The sandbox audit passed during this run. Native MPRIS positions come from
the bridge's actual player updates, not a test-generated playback clock.

Observed “Panama” at 0, then 3.4 → 103.8 → **204.1 s**, with `Playing`
status throughout, followed by “Ain't Talkin' 'Bout Love” without a next
command. There was an initial ~40 s delay while position remained zero
and another delay before the next title appeared (signed-out ad/boot
timing). The whole observation took 282 s. This establishes near-end
progress and natural transition; unlike the earlier unsandboxed test, it
does not claim a directly captured HTML `ended` timestamp.

MPRIS observation avoids the inspector's isolated-loopback issue rather
than changing the sandbox to accommodate debugging. Temporary evidence:
`sandbox-mpris-report.json`, `sandbox-mpris-audit.json` and the dedicated
`sandbox-mpris/sample-*.txt` D-Bus property snapshots.

### Normal FUSE launch

The **same identified image** also passes normal non-root FUSE launch on
the Ubuntu 24.04 WSL host, without an extraction flag or inspector:

- MPRIS reports “Panama” **10.4 → 22.4 s**, `Playing`.
- UI `Seccomp: 0`, `NoNewPrivs: 0`; WebProcess `Seccomp: 2`,
  `NoNewPrivs: 1`, with distinct mount/PID/network namespaces.
- AppDir is **read-only** in both views; the private marker is readable
  from the UI and absent from the WebProcess's filesystem.
- `host-sandbox-fuse-report.json`, `host-sandbox-fuse-audit.json` and
  `host-sandbox-fuse/mounts.txt` retain the local evidence. The host has
  desktop packages; dependency independence is established separately by
  the clean Debian run, not by the host-FUSE run alone.

No host credentials/profile were exposed. A harness issue was fixed rather
than weakening the sandbox: `XDG_RUNTIME_DIR` must be a private **Linux
filesystem** directory. The old fallback under the Windows-mounted results
directory cannot host the proxy's Unix socket. Concurrent test launchers
also now keep separate PID files so one cleanup cannot kill another test.

## Checks and reconstruction

1. Use the Ubuntu 22.04 build root and source/configuration from
   [the multimedia recipe](appimage-candidate.md). Also install
   `bubblewrap` and `xdg-dbus-proxy` there, not on the clean test root as a
   substitute for bundling them.
2. Keep `assemble.py` and its adjacent `bwrap` file together; run assembly
   on a fresh original AppDir. It copies notices, helper dependencies and
   the adapter and forces sandbox startup. Pack with the existing zstd
   `pack.sh`. Use fresh output directories; preserve the original image.
3. Run the new image with a dedicated profile and private Linux
   `XDG_RUNTIME_DIR`, with no sandbox disable/debug variables. Never work
   around denied namespaces by weakening the user's system security.
4. While the test plays, audit from the **test host's root**, not inside
   the WebProcess, using a harmless private marker outside allowed paths:

   ```sh
   python3 tools/tests/appimage-candidate/audit_sandbox.py \
     /results/<dedicated-profile> <audit-output.json> /results/<private-marker>
   ```

   The UI must be able to read the marker and the WebProcess must not.
   Permission errors are not silently counted as successful isolation.
   The helper also requires the AppDir to remain read-only in the renderer.
5. Run `python3 tools/tests/appimage-candidate/test_wrapper.py` on Linux.
   It checks relocated paths with spaces/symlinks, argument preservation,
   invalid invocations, and pass-through calls using a fake real helper;
   it does not itself create a sandbox. Actual isolation needs step 4.

The audit's positive control expects an unfiltered UI (`Seccomp: 0`), as
on these test hosts; adapt the control rather than treating a container's
pre-existing seccomp filter as evidence of a WebKit filter.

Essential temporary evidence: `sandbox-build-results/candidate-added-files.json`,
`debian-extract-fixed-report.json`, `sandbox-extract-fixed-audit.json`,
`debian-extract-fixed-runtime.log`, `sandbox-helper-versions.txt`. Raw maps
and routing files can contain local identifiers and are not committed.

Repository checks: Windows fmt/Clippy clean, 31 Rust tests, two recovery
Node tests and the Linux wrapper test pass. No product Rust/JS, Tauri
configuration, Cargo dependencies or release workflows were changed.

## Boundaries still applying

- Owner confirmed hearing the music during the earlier WSLg → Windows
  tests. That listening check is complete for that path; it is not proof
  for another native Linux/PipeWire machine.
- Signed-in playback/account persistence still requires the owner. GPU
  hardware/zero-copy rendering is not established; this environment uses
  software fallback and lacks the GL video sink plugins.
- Standalone local-file/HTTP H.264 harness attempts under forced sandbox
  did not complete reliably; do not label them passing. The earlier
  generated AAC/Opus/H.264 tests remain evidence for the multimedia-only
  candidate, not an additional sandbox-enabled H.264 completion claim.
- The WebKit inspector can lose its reverse connection after WebProcess
  changes because the renderer's loopback is now isolated. Do not restore
  host networking/debug permissions merely to make automation pass.
- Current Linux kernels/policies must permit unprivileged namespaces.
  Restrictive AppArmor/container policies and real hardware need testing.
- Complete helper/library security, source/relinking and distribution
  review is still pending. Neither this test nor preserved copyright files
  are legal approval. No Mirlo license change was made.
