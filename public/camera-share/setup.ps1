# Camera dung chung cho man tuong tac ClassIn (Windows 10/11) - chay 1 lan moi may, quyen Administrator.
# Muc tieu: lop ClassIn va game camera (file .edu) cung dung camera S1 mot luc.
# Cach lam: OBS Studio (mien phi, ma nguon mo, tai tu GitHub chinh thuc) doc S1 mot lan roi phat ra
# "OBS Virtual Camera"; ClassIn chon camera ao nay, game tu dung camera ao khi S1 dang ban.
# Khong ghi hinh, khong gui hinh di dau. Go bo: xem README.txt.
$ErrorActionPreference = 'Stop'
function Say($t, $c = 'White') { Write-Host $t -ForegroundColor $c }
# Ghi file UTF-8 KHONG BOM (OBS doc JSON/INI bi loi neu co BOM)
function WriteText($path, $text) { [IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false))) }

# ---------- 0. Quyen Administrator ----------
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Say 'Can quyen Administrator. Dang mo lai...' Yellow
  Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

# ---------- 1. Windows 11 moi: co san tuy chon dung chung camera, khong can OBS ----------
$build = [int](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuildNumber
$ubr = [int](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').UBR
Say "Windows build $build.$ubr"
if ($build -gt 26100 -or ($build -eq 26100 -and $ubr -ge 3321)) {
  Say 'May nay la Windows 11 moi: bat san "Allow multiple apps to use camera at the same time".' Green
  Say 'Settings > Bluetooth & devices > Cameras > chon camera S1 > Advanced camera options > bat cong tac do.' Green
  Start-Process 'ms-settings:camera'
  Read-Host 'Bat xong thi bam Enter de thoat (khong can cai OBS)'
  exit
}

# ---------- 2. Tim camera S1 ----------
$cams = Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in @('Camera', 'Image') }
$cams | ForEach-Object { Say ("  thay camera: " + $_.FriendlyName) }
$s1 = $cams | Where-Object { $_.FriendlyName -match 'S1|ClassIn|EEO' } | Select-Object -First 1
if (-not $s1) { $s1 = $cams | Where-Object { $_.FriendlyName -notmatch 'OBS|Virtual' } | Select-Object -First 1 }
if (-not $s1) { Say 'Khong thay camera nao. Cam S1 vao may roi chay lai.' Red; Read-Host 'Enter de thoat'; exit 1 }
$camName = $s1.FriendlyName
# Duong dan DirectShow: \\?\usb#vid_xxxx&pid_xxxx&mi_00#<instance>#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\global
$dsPath = '\\?\' + ($s1.InstanceId.ToLower() -replace '\\', '#') + '#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\global'
Say "Camera se dung chung: $camName" Green

# ---------- 3. Cai OBS Studio (im lang) ----------
$obsExe = "$env:ProgramFiles\obs-studio\bin\64bit\obs64.exe"
if (-not (Test-Path $obsExe)) {
  Say 'Dang tai OBS Studio tu GitHub chinh thuc (obsproject/obs-studio)...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $rel = Invoke-RestMethod 'https://api.github.com/repos/obsproject/obs-studio/releases/latest' -Headers @{ 'User-Agent' = 'esl-game-hub' }
  $asset = $rel.assets | Where-Object { $_.name -match 'Windows.*(x64)?.*Installer\.exe$' -and $_.name -notmatch 'arm64' } | Select-Object -First 1
  if (-not $asset) { Say 'Khong tim thay bo cai OBS cho Windows.' Red; exit 1 }
  $tmp = Join-Path $env:TEMP $asset.name
  Invoke-WebRequest $asset.browser_download_url -OutFile $tmp -UseBasicParsing
  $sig = Get-AuthenticodeSignature $tmp
  if ($sig.Status -ne 'Valid') { Say "Chu ky so cua bo cai OBS khong hop le ($($sig.Status)). Dung lai." Red; exit 1 }
  Say "Dang cai $($asset.name) ..."
  Start-Process $tmp -ArgumentList '/S' -Wait
}
if (-not (Test-Path $obsExe)) { Say 'Cai OBS khong thanh cong.' Red; exit 1 }
Say 'OBS da co tren may.' Green

# ---------- 4. Cau hinh OBS: 1 canh chi co camera S1, 1280x720 30fps ----------
Get-Process obs64 -ErrorAction SilentlyContinue | Stop-Process -Force
$cfg = Join-Path $env:APPDATA 'obs-studio'
New-Item -ItemType Directory -Force "$cfg\basic\scenes", "$cfg\basic\profiles\ClassInCam" | Out-Null
$global = @"
[General]
FirstRun=true
LastVersion=999999999
EnableAutoUpdates=false
[BasicWindow]
SysTrayEnabled=true
SysTrayWhenStarted=true
SysTrayMinimizeToTray=true
[Basic]
Profile=ClassInCam
ProfileDir=ClassInCam
SceneCollection=ClassInCam
SceneCollectionFile=ClassInCam
ConfigOnNewProfile=false
"@
WriteText "$cfg\global.ini" $global
$profileIni = @"
[General]
Name=ClassInCam
[Video]
BaseCX=1280
BaseCY=720
OutputCX=1280
OutputCY=720
FPSType=0
FPSCommon=30
"@
WriteText "$cfg\basic\profiles\ClassInCam\basic.ini" $profileIni
$deviceId = "$($camName):$dsPath"
$scene = [ordered]@{
  current_scene = 'S1'; current_program_scene = 'S1'; name = 'ClassInCam'
  scene_order = @(@{ name = 'S1' })
  sources = @(
    [ordered]@{ id = 'dshow_input'; versioned_id = 'dshow_input'; name = 'Camera S1'; uuid = [guid]::NewGuid().ToString()
      settings = [ordered]@{ video_device_id = $deviceId; last_video_device_id = $deviceId; res_type = 1; resolution = '1280x720'; frame_interval = 333333; active = $true } },
    [ordered]@{ id = 'scene'; versioned_id = 'scene'; name = 'S1'; uuid = [guid]::NewGuid().ToString()
      settings = [ordered]@{ items = @([ordered]@{ name = 'Camera S1'; visible = $true; id = 1; bounds_type = 2; bounds = @{ x = 1280.0; y = 720.0 }; bounds_align = 0; pos = @{ x = 0.0; y = 0.0 }; scale = @{ x = 1.0; y = 1.0 } }); id_counter = 1 } }
  )
}
WriteText "$cfg\basic\scenes\ClassInCam.json" ($scene | ConvertTo-Json -Depth 10)

# ---------- 5. Tu chay OBS an khi mo may, bat camera ao ----------
$obsArgs = '--startvirtualcam --minimize-to-tray --disable-shutdown-check --disable-updater --profile ClassInCam --collection ClassInCam --scene S1'
$startup = [Environment]::GetFolderPath('CommonStartup')
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut((Join-Path $startup 'Camera dung chung ClassIn.lnk'))
$lnk.TargetPath = $obsExe
$lnk.Arguments = $obsArgs
$lnk.WorkingDirectory = Split-Path $obsExe
$lnk.WindowStyle = 7
$lnk.Save()
Start-Process $obsExe -ArgumentList $obsArgs -WorkingDirectory (Split-Path $obsExe)

Say ''
Say 'XONG. OBS dang chay an duoi khay he thong va phat "OBS Virtual Camera".' Green
Say 'Viec con lai (1 lan): trong ClassIn, vao Cai dat > Camera, chon "OBS Virtual Camera".' Yellow
Say 'Kiem tra: mo file Kiem-tra-camera.edu trong lop, bam "Bat dau kiem tra".' Yellow
Read-Host 'Bam Enter de dong'
