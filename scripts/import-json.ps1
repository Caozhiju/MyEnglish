$zip = 'D:\english-vocabulary-master.zip'
# extracted folder contains an inner folder 'english-vocabulary-master'
$extract = 'D:\english-vocabulary-master\english-vocabulary-master'
Write-Output "Extracting $zip to $extract"
Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force

$src = Join-Path $extract 'json\*.json'
$dst = 'D:\OneDrive\Desktop\my-english-app\data'
if (-not (Test-Path $dst)) {
  New-Item -ItemType Directory -Path $dst | Out-Null
}

Get-ChildItem -Path $src -File | ForEach-Object {
  if (-not (Test-Path (Join-Path $dst $_.Name))) {
    Copy-Item $_.FullName -Destination $dst
    Write-Output "Copied: $($_.Name)"
  } else {
    Write-Output "Skipped (exists): $($_.Name)"
  }
}

Write-Output 'ALL_DONE'
