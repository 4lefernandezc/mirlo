"""Argument/relocation checks only; actual sandbox checks require the runtime tests."""
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest


class WrapperTests(unittest.TestCase):
    def test_relocated_prefix_and_arguments(self):
        with tempfile.TemporaryDirectory(prefix='mirlo wrapper ') as temp:
            root = pathlib.Path(temp)
            bin_dir = root / 'usr/bin'
            bin_dir.mkdir(parents=True)
            wrapper = bin_dir / 'bwrap'
            shutil.copyfile(pathlib.Path(__file__).with_name('bwrap'), wrapper)
            wrapper.chmod(0o755)
            real = bin_dir / 'bwrap.real'
            real.write_text('#!/bin/sh\nprintf "%s\\0" "$@" > "$MIRLO_WRAPPER_TEST_OUTPUT"\n')
            real.chmod(0o755)
            output = root / 'arguments'
            env = dict(os.environ, MIRLO_WRAPPER_TEST_OUTPUT=str(output))
            link = root / 'linked wrapper'
            link.symlink_to(wrapper)
            original = ['--args', '19', '--seccomp', '20', '--', '/child', 'value with spaces']
            subprocess.run([str(link), *original], env=env, check=True)
            args = output.read_bytes().decode().split('\0')[:-1]
            self.assertEqual(args[:4], original[:4])
            self.assertEqual(args[-8:], ['--ro-bind', str(root), str(root),
                                        '--chdir', str(root / 'usr'), '--', '/child', 'value with spaces'])
            for index, arg in enumerate(args[:-3]):
                if arg == '--ro-bind':
                    self.assertNotIn(args[index + 1], ['/', str(pathlib.Path.home())])
            output.unlink()
            rejected = subprocess.run([str(wrapper), '--args', '19'], env=env)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertFalse(output.exists(), 'Invalid invocation must not execute the real helper')
            subprocess.run([str(wrapper), '--version'], env=env, check=True)
            self.assertEqual(output.read_bytes(), b'--version\0')


if __name__ == '__main__':
    unittest.main()
