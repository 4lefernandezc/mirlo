#!/bin/bash
# Usage: bash pack.sh ORIGINAL_APPIMAGE STAGED_APPDIR (from a disposable output directory).
set -euo pipefail
original=$(realpath "${1:?Original v0.1.8 AppImage required}")
appdir=$(realpath "${2:?Staged AppDir required}")
test -f "$appdir/usr/bin/mirlo"
test ! -e candidate-zstd.squashfs
test ! -e Mirlo_multimedia_experimental_x86_64.AppImage
mksquashfs "$appdir" candidate-zstd.squashfs -noappend -comp zstd \
  -Xcompression-level 19 -b 1048576 -all-root -no-progress -processors 2 \
  > candidate-zstd-squashfs.log
python3 - "$original" <<'PY'
import hashlib
import pathlib
import sys

src = pathlib.Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(src).hexdigest() == '587051a8c7b48a67439c78d360c87a42b6a676178a51e26497e2028e74586740'
offset = 944632
assert src[offset:offset + 4] == b'hsqs'
out = pathlib.Path('Mirlo_multimedia_experimental_x86_64.AppImage')
with out.open('xb') as output:
    output.write(src[:offset])
    output.write(pathlib.Path('candidate-zstd.squashfs').read_bytes())
out.chmod(0o755)
print(out.name, out.stat().st_size, hashlib.sha256(out.read_bytes()).hexdigest())
PY
