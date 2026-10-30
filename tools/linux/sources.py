"""Collect notices and matching sources before an AppImage is signed/uploaded."""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import tarfile
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[2]
CUSTOM = {'libavcodec.so.59', 'libavformat.so.59', 'libavfilter.so.8',
          'libavutil.so.57', 'libgstlibav.so'}
APPRUN_SHA256 = 'f30140a43a0a59e46db21bdefdf749b9e9f2c6946e92afabbacf98b8ae73fb4f'
UPSTREAM = [
    ('type2-runtime-fedfad5.tar.gz', 'https://codeload.github.com/AppImage/type2-runtime/tar.gz/fedfad5',
     '21b78d2be9c81347880f0c8cb85cda890dc3d05c148e606f174acebb68aa364c'),
    ('AppImageKit-5735cc5.tar.gz',
     'https://codeload.github.com/AppImage/AppImageKit/tar.gz/5735cc5bed206497cddfbd2a75e1982c2606c35d',
     '65ce93060bb5d662fcff878ab5c63b530af16f2a4c86ae1c93f3dc7bf55e4e12'),
    ('fuse-3.15.0.tar.xz', 'https://github.com/libfuse/libfuse/releases/download/fuse-3.15.0/fuse-3.15.0.tar.xz',
     '70589cfd5e1cff7ccd6ac91c86c01be340b227285c5e200baa284e401eea2ca0'),
    ('squashfuse-0.5.2.tar.gz', 'https://codeload.github.com/vasi/squashfuse/tar.gz/0.5.2',
     'db0238c5981dabbd80ee09ae15387f390091668ca060a7bc38047912491443d3'),
    ('musl-1.2.5.tar.gz', 'https://musl.libc.org/releases/musl-1.2.5.tar.gz',
     'a9a118bbe84d8764da0ea0d28b3ab3fae8477fc7e4085d90102b8596fc7c75e4'),
    ('zlib-1.3.1.tar.gz', 'https://zlib.net/fossils/zlib-1.3.1.tar.gz',
     '9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23'),
    ('zstd-1.5.6.tar.gz', 'https://codeload.github.com/facebook/zstd/tar.gz/v1.5.6',
     '30f35f71c1203369dc979ecde0400ffea93c27391bfd2ac5a9715d2173d92ff7'),
    ('mimalloc-2.1.7.tar.gz', 'https://codeload.github.com/microsoft/mimalloc/tar.gz/v2.1.7',
     '0eed39319f139afde8515010ff59baf24de9e47ea316a315398e8027d198202d'),
    ('tauri-cli-2.12.3.tar.gz', 'https://codeload.github.com/tauri-apps/tauri/tar.gz/tauri-cli-v2.12.3',
     'f18dc44a1560e07b10daf6dad8b8fbf2410d76633f42ae8ef397d1569b866004'),
]


def owners(name):
    result = subprocess.run(['dpkg-query', '-S', name if name.startswith('/') else '*/' + name],
                            capture_output=True, text=True)
    return sorted({line.split(': ', 1)[0] for line in result.stdout.splitlines() if ': ' in line})


def package_info(package):
    values = subprocess.check_output(
        ['dpkg-query', '-W', '-f=${source:Package}\t${source:Version}\t${Version}', package], text=True).split('\t')
    assert len(values) == 3 and values[2], package
    return {'binary': package, 'source': values[0] or package.split(':')[0],
            'source_version': values[1] or values[2], 'binary_version': values[2]}


def source_files(repo):
    manifest = repo / '.mirlo-source-files'
    data = manifest.read_bytes() if manifest.exists() else subprocess.check_output(
        ['git', '-C', str(repo), 'ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    files = []
    for item in data.split(b'\0'):
        if not item:
            continue
        relative = pathlib.Path(item.decode())
        assert not relative.is_absolute() and '..' not in relative.parts
        source = repo / relative
        assert source.resolve().is_relative_to(repo.resolve()), f'Source escapes snapshot: {relative}'
        assert not source.is_symlink(), f'Review source symlink before distribution: {relative}'
        if source.is_file():
            files.append(relative)
    return files


def collect(appdir, work, image):
    version = json.loads((REPO / 'app/src-tauri/tauri.conf.json').read_text())['version']
    destination = work / 'distribution-sources'
    destination.mkdir()
    archives = destination / 'archives'
    archives.mkdir()
    notices = appdir / 'usr/share/mirlo-licenses'
    packages = set()
    inventory = []
    for file in sorted(appdir.rglob('*')):
        if not file.is_file() or file.is_symlink():
            continue
        relative = str(file.relative_to(appdir))
        with file.open('rb') as content:
            elf = content.read(4) == b'\x7fELF'
        if not elf:
            # Include notices for bundled theme/schema data too; caches are generated.
            if relative.startswith('usr/share/') and 'mirlo-licenses/' not in relative:
                packages.update(owners('/' + relative))
            continue
        if relative == 'usr/bin/mirlo':
            origin = ['Mirlo (sources included)']
        elif relative == 'AppRun.wrapped':
            origin = ['AppImageKit AppRun (MIT; license and source archive included)']
        elif file.name in CUSTOM:
            origin = ['Custom FFmpeg/gst-libav (sources and configuration included)']
        else:
            origin = owners('bwrap' if file.name == 'bwrap.real' else file.name)
            assert origin, f'Unattributed ELF: {relative}'
            packages.update(origin)
        inventory.append({'path': relative, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'origin': origin})
    package_rows = [package_info(package) for package in sorted(packages)]
    for row in package_rows:
        name = row['binary'].split(':')[0]
        copyright_file = pathlib.Path('/usr/share/doc') / name / 'copyright'
        assert copyright_file.is_file(), f'Missing package notice: {name}'
        shutil.copyfile(copyright_file, notices / (name + '-copyright'))
    shutil.copytree('/usr/share/common-licenses', notices / 'common-licenses')
    for name, version_string in sorted({(row['source'], row['source_version']) for row in package_rows}):
        print(f'Collecting source {name} {version_string}', flush=True)
        subprocess.run(['apt-get', '-o', 'APT::Sandbox::User=root', 'source', '--download-only',
                        name + '=' + version_string], cwd=archives, check=True)
    for file in (work / 'downloads').iterdir():
        if file.is_file():
            shutil.copy2(file, archives / file.name)
    runtime = subprocess.check_output([str(image), '--appimage-version'], text=True, stderr=subprocess.STDOUT).strip()
    assert runtime.endswith('/commit/fedfad5'), 'Review new AppImage runtime sources before release'
    offset = int(subprocess.check_output([str(image), '--appimage-offset'], text=True).strip())
    with image.open('rb') as source_image:
        runtime_sha256 = hashlib.sha256(source_image.read(offset)).hexdigest()
    apprun = hashlib.sha256((appdir / 'AppRun.wrapped').read_bytes()).hexdigest()
    assert apprun == APPRUN_SHA256, 'Review AppRun source/version before release'
    upstream_rows = []
    for name, url, expected in UPSTREAM:
        request = urllib.request.Request(url, headers={'User-Agent': 'Mirlo-release-sources'})
        with urllib.request.urlopen(request, timeout=180) as response:
            data = response.read()
        sha256 = hashlib.sha256(data).hexdigest()
        if expected:
            assert sha256 == expected, f'Source hash mismatch: {name}'
        (archives / name).write_bytes(data)
        upstream_rows.append({'file': name, 'url': url, 'sha256': sha256})
    # LGPL runtime libfuse source/patches are exact; permissive rebuild dependencies
    # are included too, without claiming their versions identify the producer's binary.
    license_members = {
        'type2-runtime-fedfad5.tar.gz': ['LICENSE'],
        'AppImageKit-5735cc5.tar.gz': ['LICENSE'],
        'tauri-cli-2.12.3.tar.gz': ['LICENSE-MIT', 'LICENSE-APACHE-2.0'],
        'musl-1.2.5.tar.gz': ['COPYRIGHT'],
        'zstd-1.5.6.tar.gz': ['LICENSE'],
        'mimalloc-2.1.7.tar.gz': ['LICENSE'],
        'squashfuse-0.5.2.tar.gz': ['LICENSE'],
        'fuse-3.15.0.tar.xz': ['LICENSE', 'LGPL2.txt'],
        'zlib-1.3.1.tar.gz': ['LICENSE'],
    }
    for archive_name, names in license_members.items():
        with tarfile.open(archives / archive_name) as archive:
            for name in names:
                member = next((member for member in archive.getmembers()
                               if member.isfile() and member.name.count('/') == 1
                               and pathlib.PurePosixPath(member.name).name == name), None)
                assert member is not None, f'Missing upstream license: {archive_name}/{name}'
                (notices / (archive_name + '-' + name)).write_bytes(archive.extractfile(member).read())
    for relative in source_files(REPO):
        output = destination / 'mirlo' / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(REPO / relative, output)
    # Mirlo statically links Rust crates; ship their source and embedded notices too.
    metadata = json.loads(subprocess.check_output([
        'cargo', 'metadata', '--locked', '--format-version', '1', '--filter-platform',
        'x86_64-unknown-linux-gnu', '--manifest-path', str(REPO / 'app/src-tauri/Cargo.toml')], text=True))
    resolved = {node['id'] for node in metadata['resolve']['nodes']}
    crates = []
    for package in metadata['packages']:
        if package['id'] not in resolved or package['source'] is None:
            continue
        assert package['source'].startswith('registry+'), 'Review non-registry Rust source'
        name = package['name'] + '-' + package['version']
        root = pathlib.Path(package['manifest_path']).parent
        shutil.copytree(root, destination / 'rust-crates' / name,
                        ignore=shutil.ignore_patterns('.git', 'target', '__pycache__'))
        crates.append({'name': package['name'], 'version': package['version'],
                       'license': package['license'], 'source': package['source']})
    shutil.copytree(notices, destination / 'notices')
    for name in ['ffmpeg-config.h', 'ffmpeg-config.mak']:
        shutil.copy2(work / name, destination / name)
    manifest = {'mirlo_version': version, 'runtime': runtime, 'runtime_sha256': runtime_sha256,
                'apprun_sha256': apprun,
                'packages': package_rows, 'rust_crates': crates,
                'upstream': upstream_rows, 'elf_files': inventory}
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    (notices / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    shutil.copy2(REPO / 'docs/linux-sources.md', destination / 'REBUILD.md')
    hashes = [hashlib.sha256(file.read_bytes()).hexdigest() + '  ' + str(file.relative_to(destination))
              for file in sorted(destination.rglob('*')) if file.is_file()]
    (destination / 'SHA256SUMS').write_text('\n'.join(hashes) + '\n')
    output = image.parent.parent / f'Mirlo_{version}_linux-sources.tar.zst'
    assert not output.exists()
    subprocess.run(['tar', '--zstd', '-cf', str(output), '-C', str(destination), '.'], check=True)
    print(f'Corresponding sources: {output.name} ({output.stat().st_size} bytes)')


if __name__ == '__main__':
    collect(pathlib.Path(sys.argv[1]).resolve(), pathlib.Path(sys.argv[2]).resolve(), pathlib.Path(sys.argv[3]).resolve())
