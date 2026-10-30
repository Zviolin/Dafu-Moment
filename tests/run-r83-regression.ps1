# 回归批处理：依次跑 17 套主验收脚本，逐套落日志到 tests/report/r83-regression/
# 用法：powershell -File tests/run-r83-regression.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $PSScriptRoot 'report\r83-regression'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$scripts = @(
    'rounds-10-acceptance.test.mjs',
    'e2e-verify.test.mjs',
    'api-integration.test.mjs',
    'api-task-pet-social.test.mjs',
    'walkthrough-r71-checkin.test.mjs',
    'walkthrough-r72-me-records.test.mjs',
    'walkthrough-r73-review-dim-sort.test.mjs',
    'walkthrough-r74-favorite-groups.test.mjs',
    'walkthrough-r75-takeout-type.test.mjs',
    'walkthrough-r76-station-map.test.mjs',
    'walkthrough-r77-station-compare.test.mjs',
    'walkthrough-r80-fzu-initial-password.test.mjs',
    'walkthrough-r80-fzu-password-ui.test.mjs',
    'walkthrough-r81-qa-doc-ui.test.mjs',
    'walkthrough-r81-qa-doc-edge.test.mjs',
    'walkthrough-r81-qa-doc-fixes.test.mjs',
    'walkthrough-r82-doc-bugs.test.mjs'
)

$summary = @()
foreach ($s in $scripts) {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($s)
    Write-Host "=== RUN $name ==="
    # 每套脚本前清限流计数，避免 register(5/3600s) / login(10/600s) 打满后误判 42901
    docker exec dafu-redis redis-cli FLUSHDB | Out-Null
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $log = Join-Path $outDir "$name.log"
    Push-Location $root
    & node (Join-Path $PSScriptRoot $s) *>&1 | Out-File -FilePath $log -Encoding utf8
    $code = $LASTEXITCODE
    Pop-Location
    $sw.Stop()
    $tail = (Get-Content $log -Tail 4) -join ' | '
    Write-Host "--- $name exit=$code 耗时=$([int]$sw.Elapsed.TotalSeconds)s :: $tail"
    $summary += [pscustomobject]@{ name = $name; exit = $code; seconds = [int]$sw.Elapsed.TotalSeconds }
}

Write-Host ""
Write-Host "=== 汇总 ==="
$summary | Format-Table -AutoSize | Out-String | Write-Host
$failed = $summary | Where-Object { $_.exit -ne 0 }
if ($failed) {
    Write-Host "失败套数: $($failed.Count) -> $($failed.name -join ', ')"
    exit 1
}
Write-Host "全部 17 套通过"
exit 0
