$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot 'install.py'
if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 $installer @args }
elseif (Get-Command python -ErrorAction SilentlyContinue) { & python $installer @args }
else { throw 'Python 3 is required. Install Python from python.org or winget, then reopen PowerShell.' }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
