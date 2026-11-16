"""Build upstream Fresh with a tiny portable-configuration patch."""
import os, subprocess, sys
from pathlib import Path

COMMIT='56eb83fde8c636f137c2535ef809befafe01cfbd'
source=Path(sys.argv[1]).resolve()
if not source.exists():
    subprocess.run(['git','clone','--depth','1','--branch','v0.5.8','--recurse-submodules','https://github.com/sinelaw/fresh.git',str(source)],check=True)
head=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
if head!=COMMIT:raise RuntimeError('Unexpected Fresh source commit: '+head)
config=source/'crates/fresh-editor-core/src/config_io.rs'
text=config.read_text(encoding='utf-8')
needle='    fn default_config_dir() -> Option<std::path::PathBuf> {\n'
patch='''    fn default_config_dir() -> Option<std::path::PathBuf> {
        if let Some(path) = std::env::var_os("FRESH_KIT_CONFIG_DIR") {
            if !path.is_empty() {
                return Some(std::path::PathBuf::from(path));
            }
        }
'''
if text.count(needle)!=1:raise RuntimeError('Fresh configuration patch did not match')
config.write_text(text.replace(needle,patch),encoding='utf-8')
env=os.environ.copy();env['CARGO_INCREMENTAL']='0'
subprocess.run(['cargo','build','--locked','--profile','min-size','-p','fresh-editor','--bin','fresh'],cwd=source,env=env,check=True)
print('Fresh built at',source/'target/min-size/fresh.exe')
