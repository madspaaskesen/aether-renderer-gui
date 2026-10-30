# Signs the Windows installer of a GitHub release with the Certum certificate (SimplySign) and
# uploads it again under the same name (--clobber).
#
#   .\scripts\sign-windows.ps1 -Tag v0.3.1
#
# Before running: SimplySign Desktop connected (token from the mobile app), GitHub CLI logged in
# (gh auth login). Thumbprint: see flixlar-caption-editor/docs/codesigning (it changes on renewal).
# Note: this signs the .msi; the .exe inside it stays unsigned (SmartScreen checks the installer).
param(
  [Parameter(Mandatory = $true)][string]$Tag,
  [string]$Thumbprint = $env:CERTUM_THUMBPRINT,
  [string]$Repo = "madspaaskesen/aether-renderer-gui",
  [string]$SignTool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
)
$ErrorActionPreference = "Stop"
if (-not $Thumbprint) { throw "Pass -Thumbprint or set CERTUM_THUMBPRINT" }

# CI uploads files with the same names: wait until the release build is done.
$ciStatus = gh run list --repo $Repo --workflow release.yml --limit 1 --json status -q ".[0].status"
if ($ciStatus -ne "completed") { throw "The release workflow is '$ciStatus', wait until it is done" }

$dir = Join-Path $env:TEMP "aether-gui-sign-$Tag"
Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $dir | Out-Null
gh release download $Tag --repo $Repo --pattern "*.msi" --dir $dir --clobber
if ($LASTEXITCODE) { throw "gh release download failed" }

foreach ($msi in Get-ChildItem $dir -Filter *.msi) {
  Write-Host "Signing $($msi.Name)"
  & $SignTool sign /sha1 $Thumbprint /tr http://time.certum.pl /td sha256 /fd sha256 /v $msi.FullName
  if ($LASTEXITCODE) { throw "signtool sign failed" }
  & $SignTool verify /pa /all $msi.FullName
  if ($LASTEXITCODE) { throw "signtool verify failed" }
  gh release upload $Tag $msi.FullName --repo $Repo --clobber
  if ($LASTEXITCODE) { throw "gh release upload failed" }
}
Write-Host "Signed and uploaded to $Tag"
