param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference = 'Stop'
$env:LOCALAPPDATA = Join-Path $env:RUNNER_TEMP 'fresh-kit-smoke'
$env:FRESH_KIT_TEST_NO_PYTHON = '1'
& $Executable --self-test
if ($LASTEXITCODE -ne 0) { throw 'Self-test without Python failed' }
$profile = Join-Path $env:LOCALAPPDATA 'FreshKit/profile/fresh'
$config = Get-Content -Raw (Join-Path $profile 'config.json') | ConvertFrom-Json
if ($config.lsp.python[0].command -ne 'python') { throw 'Expected missing-Python fallback' }
$init = Get-Content -Raw (Join-Path $profile 'init.ts')
if (-not $init.Contains('Python 3.10+ not found')) { throw 'Missing Python notice is absent' }
Remove-Item Env:FRESH_KIT_TEST_NO_PYTHON
& $Executable --self-test
if ($LASTEXITCODE -ne 0) { throw 'Self-test with system Python failed' }
$config = Get-Content -Raw (Join-Path $profile 'config.json') | ConvertFrom-Json
if ($config.lsp.python[0].command -eq 'python' -or -not (Test-Path $config.lsp.python[0].command)) { throw 'System Python was not detected' }
if ($config.lsp.python[0].args[0] -ne '-m' -or $config.lsp.python[0].args[1] -ne 'pylsp') { throw 'Unexpected LSP command' }
$env:APPDATA = Join-Path $env:LOCALAPPDATA 'FreshKit/profile'
$types = Join-Path $profile 'types'
New-Item -ItemType Directory -Force -Path $types | Out-Null
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/sinelaw/fresh/v0.5.8/crates/fresh-editor/plugins/lib/fresh.d.ts' -OutFile (Join-Path $types 'fresh.d.ts')
$fresh = Join-Path $env:LOCALAPPDATA 'FreshKit/runtime/0.3.0/fresh.exe'
& $fresh --cmd script check (Join-Path $profile 'init.ts')
if ($LASTEXITCODE -ne 0) { throw 'Generated Fresh init failed validation' }
Write-Output "EXE bytes: $((Get-Item $Executable).Length)"
