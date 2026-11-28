<#
  Учебный стенд в WSL для локальной разработки лабораторий: npm run lab:stand:wsl

  Создаёт отдельный дистрибутив WSL (по умолчанию lr-stand) из официального
  образа Ubuntu Base 24.04, ставит sshd и утилиты (provision.sh), а затем
  отключает в нём доступ к дискам Windows и запуск программ Windows:
  на стенде у ученика root, и с основной системой его ничего не должно связывать.

  Только для разработки. На сервере стенды — контейнеры Proxmox (docs/practice-lab.md).
#>
param(
    [string]$Name = "lr-stand",
    [string]$InstallDir = (Join-Path (Split-Path (Split-Path $PSScriptRoot)) "..\Learning-Roadmaps-stand"),
    [int]$Port = 2222
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Image = "ubuntu-base-24.04.5-base-amd64.tar.gz"
$Url = "https://cdimage.ubuntu.com/ubuntu-base/releases/24.04/release/$Image"
$Sha256 = "e77b6f10c2590cef872b33ee9f635a0e3fd1f57fb074c0e52b5c7f56147a0c86"

$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$existing = (wsl.exe -l -q) -replace "`0", "" | Where-Object { $_.Trim() -eq $Name }
if ($existing) {
    Write-Host "Дистрибутив $Name уже есть. Чтобы пересоздать: wsl --unregister $Name"
    exit 0
}

# 1. Ключ lab-runner
$repo = Split-Path (Split-Path $PSScriptRoot)
Push-Location $repo
$pub = (node scripts/lab-key.mjs).Trim()
Pop-Location

# 2. Образ
New-Item -ItemType Directory -Force $InstallDir | Out-Null
$tar = Join-Path $InstallDir $Image
if (-not (Test-Path $tar)) {
    Write-Host "Скачиваю $Url"
    Invoke-WebRequest -Uri $Url -OutFile $tar -UseBasicParsing
}
$hash = (Get-FileHash $tar -Algorithm SHA256).Hash.ToLower()
if ($hash -ne $Sha256) { Remove-Item $tar; throw "Контрольная сумма образа не совпала: $hash" }

# 3. Импорт и подготовка (диски Windows пока смонтированы — через них читаем provision.sh;
#    после перезапуска они отключатся)
wsl.exe --import $Name (Join-Path $InstallDir "disk") $tar --version 2
if ($LASTEXITCODE -ne 0) { throw "wsl --import завершился с ошибкой" }

$script = Join-Path $PSScriptRoot "provision.sh"
$drive = $script.Substring(0, 1).ToLower()
$linuxPath = "/mnt/$drive" + ($script.Substring(2) -replace "\\", "/")
wsl.exe -d $Name -u root -- bash -c "tr -d '\r' < '$linuxPath' > /tmp/provision.sh && bash /tmp/provision.sh $Port '$pub' wsl"
if ($LASTEXITCODE -ne 0) { throw "provision.sh завершился с ошибкой" }

# 4. Перезапуск: вступают в силу systemd и изоляция от Windows (их пишет provision.sh)
wsl.exe --terminate $Name | Out-Null

Write-Host ""
Write-Host "Стенд $Name готов. sshd: 127.0.0.1:$Port, пользователи root и student, ключ .lab/id_ed25519"
Write-Host "Запуск вместе с lab-runner: npm run lab:runner (держит стенд включённым, пока работает)"
