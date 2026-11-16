"""Pack a patched Windows Fresh binary and the user's configuration."""
import shutil, sys, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STAGE=ROOT/'portable'/'staging'
OUT=ROOT/'portable'/'payload.zip'
def main():
    binary,license_file=(Path(p).resolve() for p in sys.argv[1:3])
    if STAGE.exists():shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    shutil.copy2(binary,STAGE/'fresh.exe')
    shutil.copy2(license_file,STAGE/'FRESH-LICENSE')
    for name in ('config','runtime'):
        shutil.copytree(ROOT/name,STAGE/'kit'/name,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    with zipfile.ZipFile(OUT,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for path in sorted(STAGE.rglob('*')):
            if path.is_file():z.write(path,path.relative_to(STAGE).as_posix())
    print('Payload:',OUT.stat().st_size,'bytes')
if __name__=='__main__':main()
