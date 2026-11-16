# Fresh Kit

A lightweight Fresh setup with Vi-style editing, Gruvbox, an enhanced file explorer, Python outline and debugging.

## Windows

Download `FreshKit.exe` from Releases and run it. Its configuration is stored separately in `%LOCALAPPDATA%/FreshKit`; existing Fresh settings are not overwritten.

Python is not bundled. Install Python 3.10+ and these packages for Python-related features:

```powershell
python -m pip install python-lsp-server debugpy Send2Trash
```

## Linux and macOS

Install [Fresh](https://github.com/sinelaw/fresh) and Python 3.10+, extract the release ZIP, and run `python3 install.py`. Existing Fresh configuration is backed up first.

Fresh Kit embeds the upstream [Fresh 0.5.8 release](https://github.com/sinelaw/fresh/releases/tag/v0.5.8); its [source code](https://github.com/sinelaw/fresh/tree/v0.5.8) and GPL license are available from the upstream project.
