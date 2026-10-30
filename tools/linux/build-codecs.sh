#!/bin/bash
# Run on Ubuntu 22.04 in a dedicated build directory outside the repository.
set -euo pipefail
work=$(realpath "${1:?Build directory required}")
mkdir -p "$work/downloads" "$work/src"
test ! -e "$work/codecs"
cd "$work/downloads"
if [ ! -f ffmpeg-5.1.10.tar.xz ]; then
  curl --fail --location --retry 3 --output ffmpeg-5.1.10.tar.xz https://ffmpeg.org/releases/ffmpeg-5.1.10.tar.xz
fi
if [ ! -f gst-libav-1.20.7.tar.xz ]; then
  curl --fail --location --retry 3 --output gst-libav-1.20.7.tar.xz https://gstreamer.freedesktop.org/src/gst-libav/gst-libav-1.20.7.tar.xz
fi
sha256sum --check <<'HASHES'
392306d6fc45dab0e9e0ea55381e071842e83a2fb31d320aeda40477a7766293  ffmpeg-5.1.10.tar.xz
65e776e366f7f3549a9a829418817f464dcc5dc9845220c64a886683d8841b56  gst-libav-1.20.7.tar.xz
HASHES
cd "$work/src"
tar -xf "$work/downloads/ffmpeg-5.1.10.tar.xz"
tar -xf "$work/downloads/gst-libav-1.20.7.tar.xz"
cd ffmpeg-5.1.10
./configure --prefix="$work/codecs" --libdir="$work/codecs/lib" \
  --disable-everything --disable-autodetect --disable-gpl --disable-nonfree \
  --disable-version3 --disable-programs --disable-doc --disable-network \
  --enable-shared --disable-static --enable-decoder=aac,aac_latm,h264 \
  --enable-parser=aac,aac_latm,h264 > "$work/ffmpeg-configure.log" 2>&1
grep -q '#define CONFIG_GPL 0' config.h
grep -q '#define CONFIG_NONFREE 0' config.h
grep -q '#define CONFIG_VERSION3 0' config.h
make -j4 > "$work/ffmpeg-build.log" 2>&1
make install > "$work/ffmpeg-install.log" 2>&1
cp config.h "$work/ffmpeg-config.h"
cp ffbuild/config.mak "$work/ffmpeg-config.mak"
cd ../gst-libav-1.20.7
export PKG_CONFIG_PATH="$work/codecs/lib/pkgconfig"
export LD_LIBRARY_PATH="$work/codecs/lib"
meson setup build --prefix="$work/codecs" --libdir=lib --buildtype=release \
  --wrap-mode=nofallback -Dtests=disabled -Ddoc=disabled > "$work/gst-libav-configure.log" 2>&1
ninja -C build > "$work/gst-libav-build.log" 2>&1
ninja -C build install > "$work/gst-libav-install.log" 2>&1
python3 - "$work" <<'PY'
import ctypes, pathlib, sys
lib = ctypes.CDLL(str(pathlib.Path(sys.argv[1]) / 'codecs/lib/libavcodec.so.59'))
lib.avcodec_license.restype = ctypes.c_char_p
assert lib.avcodec_license() == b'LGPL version 2.1 or later'
PY
echo 'LGPL-configured FFmpeg and gst-libav built (not distribution approval)'
