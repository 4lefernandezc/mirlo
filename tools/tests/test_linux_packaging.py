import ast
import importlib.util
import os
import pathlib
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / 'linux/sources.py'
spec = importlib.util.spec_from_file_location('sources', path)
sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sources)


class SourceTests(unittest.TestCase):
    def test_deb_declares_sandbox_and_audio_dependencies_once(self):
        config = sources.json.loads((sources.REPO / 'app/src-tauri/tauri.conf.json').read_text())
        dependencies = config['bundle']['linux']['deb']['depends']
        self.assertEqual(len(dependencies), len(set(dependencies)))
        self.assertTrue({'bubblewrap', 'xdg-dbus-proxy', 'gstreamer1.0-plugins-bad',
                         'gstreamer1.0-libav'} <= set(dependencies))

    def test_data_ownership_uses_full_path_not_common_basename(self):
        with patch.object(sources.subprocess, 'run') as run:
            run.return_value.stdout = 'theme: /usr/share/theme/LICENSE\n'
            self.assertEqual(sources.owners('/usr/share/theme/LICENSE'), ['theme'])
            self.assertEqual(run.call_args.args[0][-1], '/usr/share/theme/LICENSE')

    def test_source_snapshot_skips_deleted_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            (root / 'ok').write_text('source')
            (root / '.mirlo-source-files').write_bytes(b'ok\0deleted\0')
            self.assertEqual(sources.source_files(root), [pathlib.Path('ok')])

    def test_source_snapshot_rejects_escape_and_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            for record in [b'../private\0', b'/private\0']:
                (root / '.mirlo-source-files').write_bytes(record)
                with self.assertRaises(AssertionError):
                    sources.source_files(root)
            (root / 'link').symlink_to('/etc/passwd')
            (root / '.mirlo-source-files').write_bytes(b'link\0')
            with self.assertRaises(AssertionError):
                sources.source_files(root)

    def test_package_epoch_and_architecture_are_preserved(self):
        with patch.object(sources.subprocess, 'check_output', return_value='source\t1:2.0-1\t1:2.0-1'):
            result = sources.package_info('binary:amd64')
        self.assertEqual(result, {'binary': 'binary:amd64', 'source': 'source',
                                  'source_version': '1:2.0-1', 'binary_version': '1:2.0-1'})

    def test_source_name_and_version_fall_back_for_native_binary(self):
        with patch.object(sources.subprocess, 'check_output', return_value='\t\t1:2.0-1'):
            result = sources.package_info('native-package:amd64')
        self.assertEqual(result['source'], 'native-package')
        self.assertEqual(result['source_version'], '1:2.0-1')

    def test_unattributed_elf_stops_release(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            appdir = root / 'app'
            appdir.mkdir()
            (appdir / 'unknown.so').write_bytes(b'\x7fELFunknown')
            with patch.object(sources, 'owners', return_value=[]):
                with self.assertRaisesRegex(AssertionError, 'Unattributed ELF'):
                    sources.collect(appdir, root, root / 'unused.AppImage')


class RepackTests(unittest.TestCase):
    def test_generated_launcher_sets_both_sandbox_variables(self):
        assembly = ast.parse(path.with_name('assemble.py').read_text())
        start = next(i for i, node in enumerate(assembly.body)
                     if isinstance(node, ast.Assign) and
                     any(isinstance(t, ast.Name) and t.id == 'app_run' for t in node.targets))
        end = next(i for i in range(start, len(assembly.body))
                   if isinstance(assembly.body[i], ast.Expr) and
                   isinstance(assembly.body[i].value, ast.Call) and
                   isinstance(assembly.body[i].value.func, ast.Attribute) and
                   assembly.body[i].value.func.attr == 'chmod')
        launcher = compile(ast.Module(body=assembly.body[start:end + 1], type_ignores=[]),
                           'assemble.py', 'exec')
        with tempfile.TemporaryDirectory(prefix='mirlo launcher ') as temp:
            root = pathlib.Path(temp)
            (root / 'AppRun').write_text('#!/bin/bash\nset -e\nthis_dir=$(dirname "$0")\n'
                                         'exec "$this_dir"/AppRun.wrapped "$@"\n')
            (root / 'apprun-hooks').mkdir()
            (root / 'apprun-hooks/linuxdeploy-plugin-gstreamer.sh').touch()
            (root / 'usr/bin').mkdir(parents=True)
            helper = root / 'usr/bin/bwrap'
            helper.write_text('#!/bin/sh\nexit "$MIRLO_TEST_BWRAP_STATUS"\n')
            helper.chmod(0o755)
            wrapped = root / 'AppRun.wrapped'
            wrapped.write_text('#!/bin/sh\nprintf "%s,%s" "${WEBKIT_FORCE_SANDBOX-unset}" '
                               '"${WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS-unset}"\n')
            wrapped.chmod(0o755)
            exec(launcher, {'target': root})
            for status, expected in [('0', '1,unset'), ('1', 'unset,1')]:
                with self.subTest(probe_exit=status):
                    env = dict(os.environ, MIRLO_TEST_BWRAP_STATUS=status,
                               WEBKIT_FORCE_SANDBOX='1', WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS='1')
                    result = subprocess.run([str(root / 'AppRun')], env=env, check=True,
                                            text=True, capture_output=True)
                    self.assertEqual(result.stdout, expected)
                    self.assertEqual('sandbox unavailable' in result.stderr, status == '1')

    def test_runtime_preserved_and_payload_replaced(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            image = root / 'Mirlo.AppImage'
            runtime = b'original runtime'
            image.write_bytes(runtime + b'hsqsold payload')
            appdir = root / 'Mirlo.AppDir'
            (appdir / 'usr/bin').mkdir(parents=True)
            for name in ['mirlo', 'bwrap.real']:
                (appdir / 'usr/bin' / name).touch()

            def squash(command, **kwargs):
                pathlib.Path(command[2]).write_bytes(b'hsqsnew payload')
                return subprocess.CompletedProcess(command, 0)

            with patch.object(sys, 'argv', ['repack.py', str(image), str(appdir)]), \
                 patch('subprocess.check_output', return_value=str(len(runtime))), \
                 patch('subprocess.run', side_effect=squash):
                runpy.run_path(str(path.with_name('repack.py')))
            self.assertEqual(image.read_bytes(), runtime + b'hsqsnew payload')


if __name__ == '__main__':
    unittest.main()
