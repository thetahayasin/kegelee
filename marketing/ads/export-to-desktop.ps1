# Copies the rendered ads into an "ads" folder on your Desktop, one folder per ad.
#
# Double-click export-to-desktop.cmd (next to this file) to run it. Run it again
# after new ads are rendered: it adds new files and replaces old ones.

$names = @{
  '01-muscle'   = '01 Stamina is a muscle'
  '02-impress'  = '02 Impress her'
  '03-howlong'  = '03 How long do you last'
  '04-chestday' = '04 Chest day'
  '05-roundtwo' = '05 Round two'
}

$videos = Join-Path $PSScriptRoot 'videos'
# GetFolderPath finds the Desktop even when OneDrive has moved it.
$ads = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ads'

Get-ChildItem $videos -File | Where-Object { $_.Name -match '^\d\d-[a-z0-9]+-' } |
  Group-Object { ($_.Name -split '-')[0..1] -join '-' } | ForEach-Object {
    $name = if ($names[$_.Name]) { $names[$_.Name] } else { $_.Name }
    $dest = Join-Path $ads $name
    New-Item -ItemType Directory -Force $dest | Out-Null
    $_.Group | Copy-Item -Destination $dest -Force
    Write-Host "$name  ($($_.Count) files)"
  }

Write-Host "`nCopied to $ads"
Invoke-Item $ads
