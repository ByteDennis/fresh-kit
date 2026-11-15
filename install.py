#!/usr/bin/env python3
"""Install Fresh Kit into the current user's Fresh configuration."""
import argparse, datetime, json, os, shutil, subprocess, sys, venv
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def config_dir():
    if sys.platform == 'win32':
        if not os.environ.get('APPDATA'):
            raise RuntimeError('APPDATA is not set')
        return Path(os.environ['APPDATA']) / 'fresh'
    if sys.platform == 'darwin':
        return Path.home() / '.config' / 'fresh'
    return Path(os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config') / 'fresh'

def install(target, skip_deps=False):
    target = Path(target).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)
    backup = target.parent / (target.name + '-backup-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    existing = [target / n for n in ('config.json', 'init.ts', 'themes/gruvbox-design.json', 'fresh-kit-runtime') if (target / n).exists()]
    if existing:
        for path in existing:
            dest = backup / path.relative_to(target); dest.parent.mkdir(parents=True, exist_ok=True)
            if path.is_dir(): shutil.copytree(path, dest)
            else: shutil.copy2(path, dest)
        print('Existing files backed up to:', backup)
    runtime = target / 'fresh-kit-runtime'; runtime.mkdir(exist_ok=True)
    envdir = runtime / 'venv'
    venv.create(envdir, with_pip=True)
    python = envdir / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    pylsp = envdir / ('Scripts/pylsp.exe' if os.name == 'nt' else 'bin/pylsp')
    if not skip_deps:
        subprocess.run([str(python), '-m', 'pip', 'install', 'debugpy>=1.8,<2', 'python-lsp-server>=1.12,<2', 'Send2Trash>=1.8,<2'], check=True)
    shutil.copy2(ROOT / 'runtime/bridge.py', runtime / 'bridge.py')
    shutil.copy2(ROOT / 'runtime/file_ops.py', runtime / 'file_ops.py')
    themes=target/'themes'; themes.mkdir(exist_ok=True)
    shutil.copy2(ROOT/'config/themes/gruvbox-design.json', themes/'gruvbox-design.json')
    config=json.loads((ROOT/'config/config.json').read_text(encoding='utf-8'))
    config['theme']=(themes/'gruvbox-design.json').as_uri()
    config['lsp']['python'][0]['command']=str(pylsp)
    (target/'config.json').write_text(json.dumps(config,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    source=(ROOT/'config/init.ts').read_text(encoding='utf-8')
    if source.count('__FRESH_KIT_PYTHON__') != 1: raise RuntimeError('Invalid Python placeholder')
    (target/'init.ts').write_text(source.replace('__FRESH_KIT_PYTHON__',json.dumps(str(python))),encoding='utf-8')
    print('Installed Fresh Kit in',target)
    print('Restart Fresh or run Reload User Config; trust your project to enable LSP.')

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--config-dir',type=Path,default=config_dir());parser.add_argument('--skip-deps',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args();install(args.config_dir,args.skip_deps)
