"""Build a minimal Windows payload. Python stays a system dependency."""
import hashlib, io, shutil, urllib.request, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STAGE=ROOT/'portable'/'staging'
OUT=ROOT/'portable'/'payload.zip'
FRESH_URL='https://github.com/sinelaw/fresh/releases/download/v0.5.8/fresh-editor-x86_64-pc-windows-msvc.zip'
def download(url):
    with urllib.request.urlopen(url,timeout=90) as r:return r.read()
def main():
    if STAGE.exists():shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    data=download(FRESH_URL);expected=download(FRESH_URL+'.sha256').decode().split()[0]
    if hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('Fresh download checksum mismatch')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for name in ('fresh.exe','LICENSE'):
            (STAGE/('FRESH-LICENSE' if name=='LICENSE' else name)).write_bytes(archive.read(name))
    for name in ('config','runtime'):
        shutil.copytree(ROOT/name,STAGE/'kit'/name,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    with zipfile.ZipFile(OUT,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for path in sorted(STAGE.rglob('*')):
            if path.is_file():z.write(path,path.relative_to(STAGE).as_posix())
    print('Payload:',OUT.stat().st_size,'bytes')
if __name__=='__main__':main()
