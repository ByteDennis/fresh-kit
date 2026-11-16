"""Verify the packaged EXE actually renders Fresh in Windows ConPTY."""
import os, pathlib, socket, sys, tempfile, time
import pyte
from winpty import PtyProcess

exe=str(pathlib.Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(prefix='fresh-kit-ui-') as tmp:
    root=pathlib.Path(tmp)
    sample=root/'sample.txt'
    sample.write_text('FRESHKIT_WINDOWS_UI_42\n',encoding='utf-8')
    env=os.environ.copy()
    env['LOCALAPPDATA']=str(root/'local')
    env['TERM']='xterm-256color'
    proc=PtyProcess.spawn([exe,'--simple',str(sample)],cwd=tmp,env=env,dimensions=(35,120))
    screen=pyte.Screen(120,35);stream=pyte.Stream(screen)
    try:
        proc.fileobj.settimeout(.5)
        deadline=time.monotonic()+40
        while time.monotonic()<deadline:
            try: stream.feed(proc.read(65536))
            except socket.timeout: pass
            except EOFError: break
            if any('FRESHKIT_WINDOWS_UI_42' in row for row in screen.display):
                print('Fresh rendered the test file in Windows ConPTY')
                break
        else:
            raise AssertionError('Fresh did not render the test file before the timeout')
        if not any('FRESHKIT_WINDOWS_UI_42' in row for row in screen.display):
            raise AssertionError('Fresh exited before rendering the test file')
    finally:
        try: proc.close(force=True)
        except Exception: pass
