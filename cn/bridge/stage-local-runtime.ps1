[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$LuaJitDirectory,
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$LuaUtf8Path,
    [switch]$Force
)

$runtimeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\Builds\luajit'))
$sources = @{
    'luajit.exe' = Join-Path $LuaJitDirectory 'luajit.exe'
    'lua51.dll' = Join-Path $LuaJitDirectory 'lua51.dll'
    'lua-utf8.dll' = $LuaUtf8Path
}

foreach ($source in $sources.Values) {
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Required Lua runtime file is missing: $source"
    }
}

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
foreach ($name in $sources.Keys) {
    $target = Join-Path $runtimeRoot $name
    if ((Test-Path -LiteralPath $target) -and -not $Force) {
        throw "Refusing to overwrite existing runtime file without -Force: $target"
    }
    Copy-Item -LiteralPath $sources[$name] -Destination $target -Force:$Force
}

Get-ChildItem -LiteralPath $runtimeRoot -File | Where-Object { $sources.ContainsKey($_.Name) } |
    Get-FileHash -Algorithm SHA256
