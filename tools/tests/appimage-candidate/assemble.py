"""Local experiment, not production packaging. Run only inside the build root."""
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess

target = pathlib.Path('/opt/mirlo-candidate.AppDir')
prefix = pathlib.Path('/opt/mirlo-codecs')
assert target.is_dir() and (target / 'usr/bin/mirlo').is_file()
assert not (target / 'usr/lib/gstreamer-1.0').exists(), 'Use a fresh v0.1.8 AppDir copy'
plugins = '''coreelements app playback typefindfunctions autodetect audioconvert
audiofx audioresample volume pulseaudio opus opusparse matroska isomp4
audioparsers subparse subenc videoparsersbad debugutilsbad videoconvert
videoscale vpx'''.split()
plugin_dir = target / 'usr/lib/gstreamer-1.0'
plugin_dir.mkdir()
libs = target / 'usr/lib'
records = []
queue = []


def copy(source, destination):
    source = pathlib.Path(source).resolve()
    if destination.exists():
        return
    shutil.copy2(source, destination)
    records.append({'source': str(source), 'destination': str(destination.relative_to(target)),
                    'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()})
    queue.append(source)


for plugin in plugins:
    copy(pathlib.Path('/usr/lib/x86_64-linux-gnu/gstreamer-1.0') / f'libgst{plugin}.so',
         plugin_dir / f'libgst{plugin}.so')
copy(prefix / 'lib/gstreamer-1.0/libgstlibav.so', plugin_dir / 'libgstlibav.so')
helpers = target / 'usr/lib/gstreamer1.0/gstreamer-1.0'
helpers.mkdir(parents=True)
copy(pathlib.Path('/usr/lib/x86_64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner'),
     helpers / 'gst-plugin-scanner')
for source, name in [('bwrap', 'bwrap.real'), ('xdg-dbus-proxy', 'xdg-dbus-proxy')]:
    destination = target / 'usr/bin' / name
    copy(pathlib.Path('/usr/bin') / source, destination)
    destination.chmod(0o755)  # No setuid helper inside an AppImage.
# Keep glibc and desktop/driver libraries on the test OS.
excluded = re.compile(r'^(?:ld-linux.*|lib(?:c|m|dl|pthread|rt|resolv|util)\.so\..*|libnss_.*|lib(?:GL|EGL|GLX|GLdispatch|gbm|drm|X11|Xext|Xrender|xcb|wayland|fontconfig|freetype|harfbuzz|fribidi|expat).*\.so.*)$')
env = dict(os.environ, LD_LIBRARY_PATH=str(prefix / 'lib'))
seen = set()
while queue:
    source = queue.pop()
    if source in seen:
        continue
    seen.add(source)
    output = subprocess.check_output(['ldd', str(source)], env=env, text=True)
    assert 'not found' not in output, output
    for name, path in re.findall(r'^\s*(\S+) => (/\S+)', output, re.M):
        assert 'faad' not in name, 'FAAD must not enter candidate'
        if not excluded.match(name):
            copy(path, libs / name)

for record in records:
    dest = target / record['destination']
    rpath = ('$ORIGIN/../lib' if dest.parent == target / 'usr/bin' else
             '$ORIGIN/..:$ORIGIN' if dest.parent == plugin_dir else
             '$ORIGIN/../..' if dest.parent == helpers else '$ORIGIN')
    subprocess.run(['patchelf', '--set-rpath', rpath, str(dest)], check=True)
    record['sha256'] = hashlib.sha256(dest.read_bytes()).hexdigest()

notice = target / 'usr/share/mirlo-multimedia-experimental'
notice.mkdir(parents=True)
for name, src in [('ffmpeg-LGPL-2.1.txt', '/opt/mirlo-codec-src/ffmpeg-5.1.10/COPYING.LGPLv2.1'),
                  ('ffmpeg-LICENSE.md', '/opt/mirlo-codec-src/ffmpeg-5.1.10/LICENSE.md'),
                  ('gst-libav-COPYING', '/opt/mirlo-codec-src/gst-libav-1.20.7/COPYING')]:
    shutil.copy2(src, notice / name)
for package in ['gstreamer1.0-plugins-base', 'gstreamer1.0-plugins-good',
                'gstreamer1.0-plugins-bad', 'libgstreamer1.0-0']:
    shutil.copy2(pathlib.Path('/usr/share/doc') / package / 'copyright',
                 notice / (package + '-copyright'))
for record in records:
    try:
        owner = subprocess.check_output(['dpkg-query', '-S', record['source']],
                                        text=True, stderr=subprocess.DEVNULL).split(': ')[0]
    except subprocess.CalledProcessError:
        continue  # Locally built FFmpeg/gst-libav have their own notices above.
    package = owner.split(':')[0]
    src = pathlib.Path('/usr/share/doc') / package / 'copyright'
    assert src.is_file(), f'Missing notice for {package}'
    shutil.copy2(src, notice / (package + '-copyright'))
shutil.copy2('/results/ffmpeg-config.h', notice / 'ffmpeg-config.h')
shutil.copy2('/results/ffmpeg-config.mak', notice / 'ffmpeg-config.mak')
(notice / 'README.txt').write_text(
    'LOCAL EXPERIMENT ONLY. Not a release or legal distribution approval.\n'
    'Mirlo executable and base libraries copied unchanged from v0.1.8.\n'
    'Added selected GStreamer plugins, gst-libav 1.20.7 and LGPL-configured FFmpeg 5.1.10.\n'
    'No FAAD. Further license/source, security and end-to-end playback review required.\n')
(target / 'apprun-hooks/linuxdeploy-plugin-gstreamer.sh').write_text('''#!/bin/bash
export GST_REGISTRY_REUSE_PLUGIN_SCANNER=no
export GST_PLUGIN_SYSTEM_PATH_1_0="$APPDIR/usr/lib/gstreamer-1.0"
export GST_PLUGIN_PATH_1_0="$APPDIR/usr/lib/gstreamer-1.0"
export GST_PLUGIN_SCANNER_1_0="$APPDIR/usr/lib/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner"
''')
app_run = target / 'AppRun'
text = app_run.read_text()
launch = 'exec "$this_dir"/AppRun.wrapped'
assert text.count(launch) == 1, 'Unexpected original AppRun'
app_run.write_text(text.replace(launch,
    'source "$this_dir"/apprun-hooks/linuxdeploy-plugin-gstreamer.sh\n\n'
    'export WEBKIT_FORCE_SANDBOX=1\n\n' + launch))
app_run.chmod(0o755)
shutil.copyfile(pathlib.Path(__file__).with_name('bwrap'), target / 'usr/bin/bwrap')
(target / 'usr/bin/bwrap').chmod(0o755)
assert not list(plugin_dir.glob('*faad*'))
pathlib.Path('/results/candidate-added-files.json').write_text(json.dumps(records, indent=2))
print(f'Candidate staged: {len(plugins) + 1} plugins; {len(records)} added ELF files')
