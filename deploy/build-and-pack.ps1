﻿﻿﻿﻿﻿# 大福食刻 · Windows 侧构建与离线打包
# 在 项目代码 根目录执行：powershell -ExecutionPolicy Bypass -File deploy\build-and-pack.ps1
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tag = 'v1.0-alpha'
$imagesDir = Join-Path $PSScriptRoot 'images'
$sqlDir = Join-Path $PSScriptRoot 'sql'
New-Item -ItemType Directory -Force -Path $imagesDir, $sqlDir | Out-Null

Push-Location $root
try {
    Write-Host '1/4 构建三个业务镜像...'
    docker compose build

    Write-Host "2/4 打 tag：$tag"
    docker tag dafu-backend:latest  "dafu-backend:$tag"
    docker tag dafu-frontend:latest "dafu-frontend:$tag"
    docker tag dafu-matting:latest  "dafu-matting:$tag"

    Write-Host '3/4 拉取三个基础镜像...'
    docker pull mysql:8.0; if ($LASTEXITCODE -ne 0) { Write-Warning 'mysql:8.0 拉取失败，使用本地镜像' }
    docker pull redis:7-alpine; if ($LASTEXITCODE -ne 0) { Write-Warning 'redis:7-alpine 拉取失败，使用本地镜像' }
    docker pull minio/minio:latest; if ($LASTEXITCODE -ne 0) { Write-Warning 'minio 拉取失败，使用本地镜像' }

    Write-Host '4/4 导出离线镜像包...'
    Copy-Item (Join-Path $root 'backend\sql\init.sql') (Join-Path $sqlDir 'init.sql') -Force

    # 封面自愈保护：后端镜像必须内置种子封面（147 张），否则新部署的 MinIO 空桶会导致图片全 404
    $cover_raw = (& docker run --rm --entrypoint sh "dafu-backend:$tag" -c 'ls /app/assets/covers/cover/202610 | wc -l' 2>$null).Trim()
    if ([int]$cover_raw -lt 100) { throw "后端镜像内置封面数量异常：$cover_raw（应为 147）" }
    Write-Host "内置封面：$cover_raw 张"

    $tar = Join-Path $imagesDir 'dafu-images.tar'
    if (Test-Path $tar) { Remove-Item $tar -Force }
    docker save -o $tar `
        mysql:8.0 redis:7-alpine minio/minio:latest `
        "dafu-backend:$tag" "dafu-frontend:$tag" "dafu-matting:$tag"
    if ($LASTEXITCODE -ne 0) { throw 'docker save 失败' }

    # 校验和：服务器侧可用 sha256sum -c 校验镜像包完整性
    $hash = (Get-FileHash $tar -Algorithm SHA256).Hash
    # 用 ascii 写出，避免 Windows PowerShell 的 utf8 带 BOM 导致 Linux `sha256sum -c` 解析失败
    "$hash  dafu-images.tar" | Out-File -FilePath (Join-Path $imagesDir 'SHA256SUMS.txt') -Encoding ascii

    $size = [math]::Round((Get-Item $tar).Length / 1GB, 2)
    Write-Host "完成：$tar（$size GB）"
    Write-Host "SHA256：$hash"
    Write-Host "建表脚本已同步：$sqlDir\init.sql"
} finally {
    Pop-Location
}
