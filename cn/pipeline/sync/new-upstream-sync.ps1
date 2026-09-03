[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ExternalEvidencePath,
  [string]$RepoRoot = (Join-Path $PSScriptRoot '../../..')
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $RepoRoot).Path
$versionPath = Join-Path $root 'cn/config/version-lock.json'
$helper = Join-Path $root 'cn/pipeline/sync/sync-contract.mjs'
$evidence = (Resolve-Path -LiteralPath $ExternalEvidencePath).Path
$evidenceRelative = [System.IO.Path]::GetRelativePath($root, $evidence)
if ([System.IO.Path]::IsPathRooted($evidenceRelative) -or $evidenceRelative -eq '..' -or $evidenceRelative.StartsWith("..$([System.IO.Path]::DirectorySeparatorChar)")) { throw 'external evidence must be a repository-relative file' }
$version = Get-Content -LiteralPath $versionPath -Raw | ConvertFrom-Json

if (-not $version.upstream.default_branch -or -not $version.upstream.commit) { throw 'version-lock upstream identity is incomplete' }

# Fail before any fetch, branch or importer action when schema identity is not manually locked.
$validation = & node $helper report $versionPath $evidence $version.upstream.commit 'sync/upstream-000000000000' 2>$null
if ($LASTEXITCODE -ne 0) { throw 'external evidence is invalid; schema identity must be locked and fallback disabled' }

& git -C $root fetch upstream $version.upstream.default_branch
if ($LASTEXITCODE -ne 0) { throw "upstream fetch failed: $LASTEXITCODE" }
$upstreamRef = "upstream/$($version.upstream.default_branch)"
$sha = (& git -C $root rev-parse $upstreamRef).Trim()
if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[a-f0-9]{40}$') { throw 'cannot resolve fetched upstream commit' }
$candidate = "sync/upstream-$($sha.Substring(0, 12))"

$existing = @(& git -C $root branch --list --format='%(refname:short)' $candidate)
if ($LASTEXITCODE -ne 0) { throw "cannot inspect candidate branch: $LASTEXITCODE" }
if ($existing.Count -ne 0) { throw "candidate branch already exists: $candidate" }

# This only creates a ref at the fetched commit. It never merges or checks out the current branch.
& git -C $root branch $candidate $sha
if ($LASTEXITCODE -ne 0) { throw "cannot create candidate branch: $LASTEXITCODE" }

$reportJson = & node $helper report $versionPath $evidence $sha $candidate
if ($LASTEXITCODE -ne 0) { throw 'cannot build compatibility report' }
$reportDir = (& git -C $root rev-parse --git-path upstream-sync-reports).Trim()
if ($LASTEXITCODE -ne 0) { throw 'cannot resolve Git metadata report path' }
if (-not [System.IO.Path]::IsPathFullyQualified($reportDir)) { $reportDir = Join-Path $root $reportDir }
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$reportPath = Join-Path $reportDir ("$($sha.Substring(0, 12)).json")
[System.IO.File]::WriteAllText($reportPath, ($reportJson + "`n"), [System.Text.UTF8Encoding]::new($false))

[pscustomobject]@{ candidate_branch = $candidate; upstream_commit = $sha; report_path = $reportPath; imported_dictionary = $false } | ConvertTo-Json -Compress
