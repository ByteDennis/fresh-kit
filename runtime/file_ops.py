"""File operations for the Fresh floating explorer; delete uses the OS trash."""
import json, os, shutil, stat, sys

def run(op, source, destination, opened):
    st = os.lstat(source)
    if not stat.S_ISREG(st.st_mode):
        raise ValueError('Only regular files are supported')
    if op in ('rename', 'move', 'delete'):
        for path in opened:
            try:
                if os.path.samefile(source, path):
                    raise ValueError('OPEN_BUFFER')
            except FileNotFoundError:
                pass
    if op in ('duplicate', 'copy'):
        created = False
        try:
            with open(source, 'rb') as src, open(destination, 'xb') as dst:
                created = True
                shutil.copyfileobj(src, dst)
            shutil.copystat(source, destination)
        except BaseException:
            if created:
                os.unlink(destination)
            raise
    elif op in ('rename', 'move'):
        os.link(source, destination, follow_symlinks=False)
        try:
            os.unlink(source)
        except BaseException:
            os.unlink(destination)
            raise
    elif op == 'delete':
        from send2trash import send2trash
        send2trash(source)
    else:
        raise ValueError('Unknown operation')

if __name__ == '__main__':
    try:
        run(sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4]))
        print('OK')
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
