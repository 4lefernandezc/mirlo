"""Run as the test host's root; select only the dedicated MIRLO_DATA_DIR profile."""
import json
import os
import pathlib
import sys

profile, output, canary = sys.argv[1:]
assert pathlib.Path(profile).is_absolute() and pathlib.Path(canary).is_absolute()
rows = []
for process in pathlib.Path('/proc').iterdir():
    if not process.name.isdecimal():
        continue
    try:
        env = dict(item.split(b'=', 1) for item in (process / 'environ').read_bytes().split(b'\0') if b'=' in item)
        if env.get(b'MIRLO_DATA_DIR') != profile.encode():
            continue
        name = (process / 'comm').read_text().strip()
        if name != 'mirlo' and not name.startswith('WebKitWeb'):
            continue
        status = dict(line.split(':', 1) for line in (process / 'status').read_text().splitlines() if ':' in line)
        row = {'process': name, 'pid': int(process.name), 'seccomp': int(status['Seccomp']),
               'noNewPrivs': int(status['NoNewPrivs']),
               'namespaces': {key: str((process / 'ns' / key).readlink()) for key in ['mnt', 'user', 'pid', 'net']}}
        appdir = env[b'APPDIR'].decode()
        row['appDirReadOnly'] = bool(os.statvfs(process / 'root' / appdir.lstrip('/')).f_flag & os.ST_RDONLY)
        try:
            with (process / 'root' / canary.lstrip('/')).open('rb') as marker:
                marker.read(1)
            row['canaryVisible'] = True
        except FileNotFoundError:
            row['canaryVisible'] = False
        rows.append(row)
    except (FileNotFoundError, ProcessLookupError):
        continue
pathlib.Path(output).write_text(json.dumps(rows, indent=2))
ui = next(row for row in rows if row['process'] == 'mirlo')
web = [row for row in rows if row['process'].startswith('WebKitWeb')]
# shortcut: expects an unfiltered UI; adapt the positive control for seccomp-filtered test hosts.
assert ui['seccomp'] == 0 and ui['canaryVisible'], 'UI positive control'
assert web, 'At least one WebProcess required'
for row in web:
    assert row['seccomp'] == 2 and row['noNewPrivs'] == 1, row
    assert row['appDirReadOnly'], row
    assert not row['canaryVisible'], row
    assert all(row['namespaces'][key] != ui['namespaces'][key] for key in ['mnt', 'pid', 'net']), row
print('PASS: WebProcess filter/namespaces active; private file hidden; UI positive control passes')
