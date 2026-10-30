#!/bin/bash
# Experimental isolated Ubuntu 22.04 recipe; see docs/research/appimage-candidate.md.
set -euo pipefail
cd /results
sha256sum --check <<'HASHES'
392306d6fc45dab0e9e0ea55381e071842e83a2fb31d320aeda40477a7766293  ffmpeg-5.1.10.tar.xz
65e776e366f7f3549a9a829418817f464dcc5dc9845220c64a886683d8841b56  gst-libav-1.20.7.tar.xz
HASHES
mkdir -p /opt/mirlo-codec-src
cd /opt/mirlo-codec-src
tar -xf /results/ffmpeg-5.1.10.tar.xz
tar -xf /results/gst-libav-1.20.7.tar.xz
cd ffmpeg-5.1.10
./configure --prefix=/opt/mirlo-codecs --libdir=/opt/mirlo-codecs/lib \
  --disable-everything --disable-autodetect --disable-gpl --disable-nonfree \
  --disable-version3 --disable-programs --disable-doc --disable-network \
  --enable-shared --disable-static --enable-decoder=aac,aac_latm,h264 \
  --enable-parser=aac,aac_latm,h264 > /results/ffmpeg-configure.log 2>&1
grep -q '#define CONFIG_GPL 0' config.h
grep -q '#define CONFIG_NONFREE 0' config.h
grep -q '#define CONFIG_VERSION3 0' config.h
make -j4 > /results/ffmpeg-build.log 2>&1
make install > /results/ffmpeg-install.log 2>&1
cp config.h /results/ffmpeg-config.h
cp ffbuild/config.mak /results/ffmpeg-config.mak
cd ../gst-libav-1.20.7
export PKG_CONFIG_PATH=/opt/mirlo-codecs/lib/pkgconfig
export LD_LIBRARY_PATH=/opt/mirlo-codecs/lib
meson setup build --prefix=/opt/mirlo-codecs --libdir=lib --buildtype=release \
  --wrap-mode=nofallback -Dtests=disabled -Ddoc=disabled > /results/gst-libav-configure.log 2>&1
ninja -C build > /results/gst-libav-build.log 2>&1
ninja -C build install > /results/gst-libav-install.log 2>&1
python3 - <<'PY'
import ctypes
lib = ctypes.CDLL('/opt/mirlo-codecs/lib/libavcodec.so.59')
lib.avcodec_license.restype = ctypes.c_char_p
assert lib.avcodec_license() == b'LGPL version 2.1 or later'
PY
echo 'LGPL-configured FFmpeg and gst-libav built (not distribution approval)'
