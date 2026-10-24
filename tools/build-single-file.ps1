param(
  [string]$Entry = 'index.html',
  [string]$Out = 'dist/ProtoTweak.html'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$entryPath = if ([System.IO.Path]::IsPathRooted($Entry)) { $Entry } else { Join-Path $root $Entry }
$outPath = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $root $Out }
$baseDir = Split-Path -Parent $entryPath

if (-not (Test-Path -LiteralPath $entryPath)) {
  throw "Entry not found: $entryPath"
}

$html = [System.IO.File]::ReadAllText($entryPath, [System.Text.Encoding]::UTF8)

$cssEvaluator = [System.Text.RegularExpressions.MatchEvaluator]{
  param($m)
  $href = $m.Groups[1].Value
  if ($href -match '^(https?:)?//') { throw "External stylesheet is not allowed: $href" }
  $file = Join-Path $baseDir $href
  $css = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
  return "<style data-pt-inlined=""$([System.IO.Path]::GetFileName($file))"">`n$css`n</style>"
}
$html = [regex]::Replace($html, '<link\b[^>]*href="([^"]+\.css)"[^>]*>', $cssEvaluator, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

$jsEvaluator = [System.Text.RegularExpressions.MatchEvaluator]{
  param($m)
  $src = $m.Groups[1].Value
  if ($src -match '^(https?:)?//') { throw "External script is not allowed: $src" }
  $file = Join-Path $baseDir $src
  $js = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
  $js = [regex]::Replace($js, '</script', '<\/script', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  return "<script data-pt-inlined=""$([System.IO.Path]::GetFileName($file))"">`n$js`n</script>"
}
$html = [regex]::Replace($html, '<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*</script>', $jsEvaluator, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

if ($html -match '<script\b[^>]*\bsrc=') { throw 'Inlining failed: script src remains' }
if ($html -match '<link\b[^>]*rel="stylesheet"') { throw 'Inlining failed: stylesheet link remains' }

$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$banner = "<!-- ProtoTweak single-file build - $stamp -->`n"
$doctypeMatch = [regex]::Match($html, '^\s*(<!doctype[^>]*>)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
if ($doctypeMatch.Success) {
  $at = $doctypeMatch.Groups[1].Index + $doctypeMatch.Groups[1].Length
  $html = $html.Substring(0, $at) + "`n" + $banner + $html.Substring($at)
} else {
  $html = "<!doctype html>`n" + $banner + $html
}
$meta = "<meta name=""generator"" content=""ProtoTweak single-file build $stamp"">`n"
$headMatch = [regex]::Match($html, '<head\b[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
if ($headMatch.Success) {
  $insertAt = $headMatch.Index + $headMatch.Length
  $html = $html.Substring(0, $insertAt) + $meta + $html.Substring($insertAt)
}

$outDir = Split-Path -Parent $outPath
if (-not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outPath, $html, $utf8)

$size = (Get-Item -LiteralPath $outPath).Length
Write-Host "Built: $outPath"
Write-Host ("Size: {0:N1} KB" -f ($size / 1024))
Write-Host ("Scripts inlined: {0}" -f ([regex]::Matches($html, 'data-pt-inlined="')).Count)
