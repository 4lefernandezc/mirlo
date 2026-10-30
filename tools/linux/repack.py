"""Repack the generated AppDir before (never after) updater signing."""
import hashlib
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

image = pathlib.Path(sys.argv[1]).resolve()
appdir = pathlib.Path(sys.argv[2]).resolve()
assert image.suffix == '.AppImage' and (appdir / 'usr/bin/mirlo').is_file()
assert (appdir / 'usr/bin/bwrap.real').is_file()
offset = int(subprocess.check_output([str(image), '--appimage-offset'], text=True).strip())
assert 0 < offset < image.stat().st_size
with image.open('rb') as source:
    runtime = source.read(offset)
    assert source.read(4) == b'hsqs', 'Unexpected AppImage format'
with tempfile.TemporaryDirectory(prefix='mirlo-repack-', dir=image.parent) as temp:
    squash = pathlib.Path(temp) / 'payload.squashfs'
    subprocess.run(['mksquashfs', str(appdir), str(squash), '-noappend', '-comp', 'zstd',
                    '-Xcompression-level', '19', '-b', '1048576', '-all-root', '-no-progress',
                    '-processors', '2'], check=True)
    candidate = pathlib.Path(temp) / image.name
    with candidate.open('xb') as output, squash.open('rb') as payload:
        output.write(runtime)
        shutil.copyfileobj(payload, output)
    candidate.chmod(0o755)
    os.replace(candidate, image)
print(image.name, image.stat().st_size, hashlib.sha256(image.read_bytes()).hexdigest())
