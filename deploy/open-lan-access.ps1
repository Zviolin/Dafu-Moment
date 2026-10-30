﻿﻿﻿<#
.SYNOPSIS
    为「大福食刻」开放局域网访问（Windows 防火墙入站放行）。

.DESCRIPTION
    幂等添加/删除 Windows 防火墙入站规则，并打印本机所有可用的局域网访问地址。
    对外只需要前端端口 8095：Nginx 已反代 /api（后端）与 /img（MinIO），
    后端 3000 仅绑定 127.0.0.1，不应对局域网/公网开放。
    本机若使用 WSL2 镜像网络（.wslconfig 中 networkingMode=mirrored、firewall=true，
    Docker Desktop 常见配置），入站还会被 Hyper-V 防火墙拦截，脚本会同时放行。
    需要管理员权限：脚本检测到非管理员时会自动请求提权。

.PARAMETER Port
    要放行的端口，默认 8095。

.PARAMETER Remove
    删除规则，关闭局域网访问。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\deploy\open-lan-access.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\deploy\open-lan-access.ps1 -Remove
#>
param(
    [int]$Port = 8095,
    [switch]$Remove
)

# 规则名固定，便于幂等更新与删除
$RULE_NAME = "Dafu-Moment 局域网访问 (TCP $Port)"
# WSL2 镜像网络的 Hyper-V 防火墙规则名与 VM 创建者 GUID（Windows 11 22H2+ 固定值）
$HV_RULE_NAME = "Dafu-Moment 局域网访问 HyperV (TCP $Port)"
$HV_VM_CREATOR = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'

<#
.SYNOPSIS
    判断当前会话是否具备管理员权限。
.OUTPUTS
    System.Boolean
#>
function test_admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

<#
.SYNOPSIS
    收集本机可用于局域网访问的 IPv4 地址（排除回环与 APIPA 自动地址）。
.OUTPUTS
    System.String[]
#>
function get_lan_ipv4 {
    $rows = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
            $_.InterfaceAlias -notmatch 'Loopback'
        }
    return @($rows | Select-Object -ExpandProperty IPAddress -Unique)
}

<#
.SYNOPSIS
    按目标状态写入/删除防火墙入站规则。
.DESCRIPTION
    - 已存在同名规则时直接启用并改为允许（幂等）
    - Profile=Any：WLAN 常被判为「公用网络」，只放行专用网络会失效
#>
function set_firewall_rule {
    $existing = Get-NetFirewallRule -DisplayName $RULE_NAME -ErrorAction SilentlyContinue
    if ($Remove) {
        if ($existing) {
            Remove-NetFirewallRule -DisplayName $RULE_NAME
            Write-Host "[OK] 已删除规则：$RULE_NAME" -ForegroundColor Yellow
        } else {
            Write-Host "[SKIP] 规则不存在：$RULE_NAME"
        }
        return
    }
    if ($existing) {
        Set-NetFirewallRule -DisplayName $RULE_NAME -Enabled True -Action Allow -Profile Any -Direction Inbound
        Write-Host "[OK] 已更新规则：$RULE_NAME" -ForegroundColor Green
        return
    }
    New-NetFirewallRule -DisplayName $RULE_NAME -Direction Inbound -Protocol TCP `
        -LocalPort $Port -Action Allow -Profile Any -Description "大福食刻前端局域网访问" | Out-Null
    Write-Host "[OK] 已新增规则：$RULE_NAME" -ForegroundColor Green
}

<#
.SYNOPSIS
    按目标状态写入/删除 Hyper-V 防火墙入站规则（WSL2 镜像网络专用）。
.DESCRIPTION
    仅当系统存在 New-NetFirewallHyperVRule（Windows 11 22H2+）时生效；
    WSL2 未开启镜像网络或非 Docker Desktop 场景可安全跳过。
#>
function set_hyperv_rule {
    if (-not (Get-Command New-NetFirewallHyperVRule -ErrorAction SilentlyContinue)) {
        Write-Host "[SKIP] 系统不支持 Hyper-V 防火墙命令（非 WSL2 镜像网络场景可忽略）"
        return
    }
    $existing = Get-NetFirewallHyperVRule -Name $HV_RULE_NAME -ErrorAction SilentlyContinue
    if ($Remove) {
        if ($existing) {
            Remove-NetFirewallHyperVRule -Name $HV_RULE_NAME
            Write-Host "[OK] 已删除 Hyper-V 规则：$HV_RULE_NAME" -ForegroundColor Yellow
        } else {
            Write-Host "[SKIP] Hyper-V 规则不存在：$HV_RULE_NAME"
        }
        return
    }
    if ($existing) {
        Set-NetFirewallHyperVRule -Name $HV_RULE_NAME -Enabled True -Action Allow
        Write-Host "[OK] 已更新 Hyper-V 规则：$HV_RULE_NAME" -ForegroundColor Green
        return
    }
    New-NetFirewallHyperVRule -Name $HV_RULE_NAME -DisplayName $HV_RULE_NAME `
        -Direction Inbound -VMCreatorId $HV_VM_CREATOR -Protocol TCP `
        -LocalPorts @("$Port") -Action Allow | Out-Null
    Write-Host "[OK] 已新增 Hyper-V 规则：$HV_RULE_NAME" -ForegroundColor Green
}

<#
.SYNOPSIS
    逐个探测本机局域网地址的首页与健康接口，输出可直接分享的地址。
#>
function show_access_urls {
    Write-Host ""
    Write-Host "局域网访问地址（同一 WiFi/交换机下的其他设备可直接打开）：" -ForegroundColor Cyan
    $ip_list = get_lan_ipv4
    if ($ip_list.Count -eq 0) {
        Write-Host "  [WARN] 未发现可用 IPv4 地址，请检查网络连接" -ForegroundColor Yellow
        return
    }
    foreach ($ip in $ip_list) {
        $url = "http://$ip`:$Port"
        $status = "无法访问"
        try {
            $resp = Invoke-WebRequest -Uri "$url/" -TimeoutSec 5 -UseBasicParsing
            if ($resp.StatusCode -eq 200) { $status = "可访问 200" }
        } catch {
            $status = "未通（检查防火墙/网络）"
        }
        $tag = if ($ip -like '26.*') { '（Radmin VPN 虚拟局域网）' } else { '' }
        Write-Host ("  {0,-24} {1}{2}" -f $url, $status, $tag)
    }
    Write-Host ""
    Write-Host "提示：容器未启动时请先 docker compose up -d；端口改过请用 -Port 指定。" -ForegroundColor DarkGray
}

if (-not (test_admin)) {
    Write-Host "[INFO] 需要管理员权限，正在请求提权（请在弹窗点「是」）..." -ForegroundColor Yellow
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port $Port"
    if ($Remove) { $arguments += " -Remove" }
    Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Verb RunAs
    exit 0
}

set_firewall_rule
set_hyperv_rule
if (-not $Remove) { show_access_urls }
