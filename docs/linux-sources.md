# Linux corresponding sources and rebuilding

Mirlo itself remains MIT-licensed. Its Linux AppImage also contains native
libraries/programs under their respective licenses, including LGPL code.
Their terms are not replaced by Mirlo's MIT license.

Each release's `Mirlo_<version>_linux-sources.tar.zst` accompanies the
AppImage. Keep that archive available for the release, not only a link to
upstream's current downloads. It contains:

- Original Ubuntu source packages (`.dsc`, upstream tarballs and distribution
  patches), with source/binary package versions in `manifest.json`.
- The exact custom FFmpeg 5.1.10 and gst-libav 1.20.7 sources and FFmpeg's
  generated configuration. GPL, nonfree, version3 and autodetection are off;
  only native AAC/AAC-LATM/H.264 decoders/parsers are enabled.
- AppImage runtime source at `fedfad5` and its libfuse 3.15.0 source/patch
  recipe; AppRun source at AppImageKit commit `5735cc5`; squashfuse source;
  permissive runtime dependency sources/notices; and Tauri notices. Permissive
  dependency sources support rebuilding; their versions do not claim to
  identify the producer's binary.
- Mirlo's source snapshot, Cargo.lock, packaging scripts and copied notices,
  plus the resolved Linux Rust crate sources (including their licenses).
- `SHA256SUMS` for the archive's files. These are separate from the release's
  outer `SHA256SUMS.txt`.
- `manifest.json` also records the AppImage runtime prefix hash and the exact
  AppRun/helper/library hashes from the final AppDir.

The same notices and binary inventory are installed inside the AppImage at
`usr/share/mirlo-licenses/`. `.deb` packages instead use the distribution's
native libraries/codecs, whose package manager supplies notices/sources.

## Verify and inspect

```sh
mkdir mirlo-sources
tar --zstd -xf Mirlo_<version>_linux-sources.tar.zst -C mirlo-sources
cd mirlo-sources
sha256sum -c SHA256SUMS
# Read manifest.json, notices/, and each upstream source's license/build docs.
```

Ubuntu archives are fetched using APT's authenticated source indexes and
recorded at their installed source version; arbitrary unowned ELF files
stop packaging. FFmpeg/gst-libav and libfuse/squashfuse have pinned source
hash checks. All upstream snapshots are version/commit-addressed over
HTTPS with pinned SHA-256 checks recorded in the manifest.

## Replace or relink a library locally

Mirlo's MIT license does not restrict modifying your copy; third-party
component licenses still apply. Updater signatures authenticate official
downloads; they do not prevent running a locally modified extracted copy.

```sh
chmod +x Mirlo_<version>_amd64.AppImage
./Mirlo_<version>_amd64.AppImage --appimage-extract
# Replace an ABI-compatible library in squashfs-root/usr/lib/.
# Keep the WebKit sandbox and non-setuid helper layout intact.
./squashfs-root/AppRun
```

To rebuild a custom codec on Ubuntu 22.04 with the listed development
dependencies installed, start with a fresh generic build path (avoids
embedding a personal home path into configuration):

```sh
mkdir -p /tmp/mirlo-linux/downloads
cp archives/ffmpeg-5.1.10.tar.xz archives/gst-libav-1.20.7.tar.xz /tmp/mirlo-linux/downloads/
bash mirlo/tools/linux/build-codecs.sh /tmp/mirlo-linux
```

This uses the included archives without downloading them again, verifying
their hashes before compilation. `--wrap-mode=nofallback` prevents Meson
from silently downloading a different FFmpeg. Build dependencies include
GCC/make, nasm, pkg-config, Meson/Ninja and GStreamer core/base development
headers. Source packages can be unpacked with `dpkg-source -x <package.dsc>`;
follow their included build instructions for a modified version.

For a complete Mirlo build, use Rust, the pinned Tauri CLI 2.12.3 and the
Linux prerequisites in `.github/workflows/release.yml`. Run the release
recipe from `mirlo/app/`; build outputs must be outside source/OneDrive.
`tools/linux/release.sh` builds first, assembles licenses/sources and finalizes
the AppImage, then signs the **final bytes**. A locally modified build can
use its own updater key/public key pair, or disable updater artifacts for
an unsigned developer build. Do not share the project's private key.

The runtime source's build scripts and libfuse patch are inside its source
archive. They provide a relinking route for the runtime's LGPL library
separately from Mirlo, which runs as a separate executable. The packaging
recipe preserves the runtime prefix and changes only its SquashFS payload.

Native system glibc/graphics drivers/fonts are not made portable by this
archive; use a supported desktop with glibc 2.35+ and working user namespaces.
Source/notice collection is an engineering compliance measure, not legal
advice or a claim that every platform/hardware combination was tested.
