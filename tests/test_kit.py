import json, os, pathlib, subprocess, sys, tempfile, time, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import install

class KitTests(unittest.TestCase):
    def test_install_preserves_backup_and_generates_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=pathlib.Path(tmp)/'fresh';target.mkdir();(target/'config.json').write_text('{"old":true}')
            install.install(target,skip_deps=True)
            config=json.loads((target/'config.json').read_text(encoding='utf-8'))
            self.assertEqual(config['theme'],(target/'themes/gruvbox-design.json').as_uri())
            self.assertTrue(pathlib.Path(config['lsp']['python'][0]['command']).is_absolute())
            source=(target/'init.ts').read_text(encoding='utf-8')
            self.assertNotIn('__FRESH_KIT_PYTHON__',source)
            backups=list(target.parent.glob('fresh-backup-*/config.json'))
            self.assertEqual(json.loads(backups[0].read_text()),{'old':True})
            self.assertTrue((target/'fresh-kit-runtime/bridge.py').is_file())

    def test_copy_move_and_preserve_open_buffer(self):
        from importlib.util import spec_from_file_location,module_from_spec
        spec=spec_from_file_location('file_ops',ROOT/'runtime/file_ops.py');module=module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            a=pathlib.Path(tmp)/'a';b=pathlib.Path(tmp)/'b';a.write_text('hello')
            module.run('copy',str(a),str(b),[]);self.assertEqual(b.read_text(),'hello')
            with self.assertRaisesRegex(ValueError,'OPEN_BUFFER'):module.run('delete',str(a),'',[str(a)])
            c=pathlib.Path(tmp)/'c';module.run('move',str(a),str(c),[]);self.assertTrue(c.exists());self.assertFalse(a.exists())

    def test_debug_bridge_runs_and_exits(self):
        # A real adapter launch over the same socket transport used by Fresh.
        with tempfile.TemporaryDirectory(prefix='fk-') as tmp:
            root=pathlib.Path(tmp);sock=str(root/'b.sock');source=root/'sample.py';source.write_text('value = 5\nprint(value)\n')
            bridge=str(ROOT/'runtime/bridge.py'); server=subprocess.Popen([sys.executable,bridge,'serve',sock])
            def call(payload):
                raw=subprocess.check_output([sys.executable,bridge,'call',sock,json.dumps(payload)],text=True)
                result=json.loads(raw);self.assertTrue(result['ok'],result);return result
            try:
                for _ in range(100):
                    if pathlib.Path(sock).exists():break
                    if server.poll() is not None:self.fail('Bridge exited before creating socket')
                    time.sleep(.05)
                state=call({'op':'start','file':str(source),'breakpoints':[], 'python':sys.executable,'debugpy_path':'','cwd':str(root)})
                deadline=time.time()+15
                while state['status']!='finished' and time.time()<deadline:
                    time.sleep(.2);state=call({'op':'status'})
                self.assertEqual(state['status'],'finished',state)
                call({'op':'stop'})
                server.wait(timeout=15)
            finally:
                if server.poll() is None:server.terminate();server.wait(timeout=5)

if __name__=='__main__':unittest.main()
