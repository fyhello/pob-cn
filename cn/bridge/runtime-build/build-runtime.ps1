[CmdletBinding()]
param(
    [string]$OutputDirectory,
    [string]$VcVarsAllPath,
    [switch]$Stage
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    throw 'This runtime builder supports Windows x64 only.'
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$luaJitTemplate = Join-Path $PSScriptRoot 'third_party\luajit'
$luaUtf8Template = Join-Path $PSScriptRoot 'third_party\luautf8'

foreach ($requiredPath in @(
    "$luaJitTemplate\COPYRIGHT",
    "$luaJitTemplate\src\msvcbuild.bat",
    "$luaJitTemplate\src\lj_utf8win.c",
    "$luaJitTemplate\src\lj_utf8win.h",
    "$luaUtf8Template\LICENSE",
    "$luaUtf8Template\lutf8lib.c",
    "$luaUtf8Template\unidata.h"
)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "The vendored runtime build input is missing: $requiredPath"
    }
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repositoryRoot 'Builds\runtime-build-output'
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

foreach ($runtimeFile in @('luajit.exe', 'lua51.dll', 'lua-utf8.dll')) {
    $existingOutput = Join-Path $OutputDirectory $runtimeFile
    if (Test-Path -LiteralPath $existingOutput -PathType Leaf) {
        throw "Refusing to overwrite an existing build output: $existingOutput"
    }
}

if ([string]::IsNullOrWhiteSpace($VcVarsAllPath)) {
    $vswherePath = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path -LiteralPath $vswherePath -PathType Leaf)) {
        throw 'Visual Studio Build Tools were not found. Supply -VcVarsAllPath explicitly.'
    }
    $visualStudioRoot = (& $vswherePath -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
    if ([string]::IsNullOrWhiteSpace($visualStudioRoot)) {
        throw 'The Visual Studio x64 C++ toolchain was not found. Supply -VcVarsAllPath explicitly.'
    }
    $VcVarsAllPath = Join-Path $visualStudioRoot 'VC\Auxiliary\Build\vcvarsall.bat'
}

$VcVarsAllPath = [System.IO.Path]::GetFullPath($VcVarsAllPath)
if (-not (Test-Path -LiteralPath $VcVarsAllPath -PathType Leaf)) {
    throw "MSVC environment script is missing: $VcVarsAllPath"
}

$buildParent = Join-Path $repositoryRoot 'Builds\runtime-build-work'
$buildRoot = Join-Path $buildParent ([guid]::NewGuid().ToString('N'))
$workingLuaJit = Join-Path $buildRoot 'LuaJIT'
$workingUtf8 = Join-Path $buildRoot 'luautf8'
New-Item -ItemType Directory -Path $buildParent, $buildRoot, $OutputDirectory -Force | Out-Null
Copy-Item -LiteralPath $luaJitTemplate -Destination $workingLuaJit -Recurse
Copy-Item -LiteralPath $luaUtf8Template -Destination $workingUtf8 -Recurse

# LuaJIT uses this file when its source tree intentionally has no .git directory.
Set-Content -LiteralPath "$workingLuaJit\.relver" -Value '1784580905' -NoNewline -Encoding ascii

$luaJitSource = Join-Path $workingLuaJit 'src'
$luaJitBuildCommand = "call `"$VcVarsAllPath`" x64 >nul && cd /d `"$luaJitSource`" && call msvcbuild.bat"
& cmd.exe /d /s /c $luaJitBuildCommand
if ($LASTEXITCODE -ne 0) {
    throw "LuaJIT compilation failed with exit code $LASTEXITCODE."
}

Copy-Item -LiteralPath "$luaJitSource\luajit.exe" -Destination "$OutputDirectory\luajit.exe"
Copy-Item -LiteralPath "$luaJitSource\lua51.dll" -Destination "$OutputDirectory\lua51.dll"

$luaUtf8BuildCommand = "call `"$VcVarsAllPath`" x64 >nul && cd /d `"$workingUtf8`" && cl.exe /nologo /LD /MD /DLUA_BUILD_AS_DLL /I `"$luaJitSource`" `"$workingUtf8\lutf8lib.c`" `"$luaJitSource\lua51.lib`" /link /OUT:`"$OutputDirectory\lua-utf8.dll`""
& cmd.exe /d /s /c $luaUtf8BuildCommand
if ($LASTEXITCODE -ne 0) {
    throw "Lua UTF-8 compilation failed with exit code $LASTEXITCODE."
}

& "$OutputDirectory\luajit.exe" -v
if ($LASTEXITCODE -ne 0) {
    throw "The compiled LuaJIT executable failed its version probe with exit code $LASTEXITCODE."
}

$previousLuaCpath = $env:LUA_CPATH
try {
    $env:LUA_CPATH = "$OutputDirectory\?.dll;;"
    & "$OutputDirectory\luajit.exe" -e "local module = require('lua-utf8'); assert(type(module) == 'table')"
    if ($LASTEXITCODE -ne 0) {
        throw "The compiled lua-utf8 module failed its load probe with exit code $LASTEXITCODE."
    }
} finally {
    $env:LUA_CPATH = $previousLuaCpath
}

if ($Stage) {
    & "$repositoryRoot\cn\bridge\stage-local-runtime.ps1" -LuaJitDirectory $OutputDirectory -LuaUtf8Path "$OutputDirectory\lua-utf8.dll" -Force
    if ($LASTEXITCODE -ne 0) {
        throw "Runtime staging failed with exit code $LASTEXITCODE."
    }
}

Get-ChildItem -LiteralPath $OutputDirectory -File |
    Where-Object { $_.Name -in @('luajit.exe', 'lua51.dll', 'lua-utf8.dll') } |
    Get-FileHash -Algorithm SHA256
