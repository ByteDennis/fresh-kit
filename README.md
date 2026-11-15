# Fresh Kit

A portable Fresh editor setup with Vi shortcuts, Gruvbox, a larger file explorer, Python outline, and an experimental Python debugger.

Requires Fresh 0.5.8, Python 3.10+, and internet access. Install Fresh separately: on Windows, `winget install fresh-editor`; on other systems use the [official instructions](https://github.com/sinelaw/fresh). Python must be available in the terminal. The installer creates a private virtual environment and installs `python-lsp-server`, `debugpy`, and `Send2Trash`.

## Install

Download and extract a release ZIP. In PowerShell on Windows:

```powershell
py -3 install.py
```

On Linux or macOS:

```sh
python3 install.py
```

Restart Fresh. Trust the workspace to enable language servers. Existing settings touched by the installer are copied to a timestamped `fresh-backup-*` directory beside the config directory. This installs the kit's config as a whole, replacing previous `config.json` and `init.ts`; inspect the backup to merge custom settings.

## Shortcuts

In Vi normal mode: `g d` definition, `g r` references, `K` hover, `g p` diagnostics. `Ctrl+T` opens the terminal. The command palette has `Keys`, `Python: Focus Outline`, and `Python: Toggle Outline`. File explorer `z` opens the larger browser. Python debugging uses `Ctrl+D` then `Ctrl+P` to start, `Ctrl+D` then `Ctrl+D` to toggle a breakpoint, and `Ctrl+D` then `Ctrl+Q` to stop.

Key delivery varies by terminal and multiplexer. TUIOS configuration is separate. Python debugging is experimental and uses a local debugpy bridge. The large explorer's directory size display depends on `du`; Windows may show it as unavailable. Some file operations support regular files only. Fresh APIs and keyboard behavior can change with Fresh versions.
