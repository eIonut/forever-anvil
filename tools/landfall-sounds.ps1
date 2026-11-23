# Turns build/landfall-sounds/*.wav (from node tools/landfall-sounds.js) into landfall/Landfall/Media/Sounds/*.mp3,
# with the MP3 encoder built into Windows (Media Foundation, through WinRT), so nothing needs installing.
# Run from the repo root: powershell -ExecutionPolicy Bypass -File tools/landfall-sounds.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "build\landfall-sounds"
$out = Join-Path $root "landfall\Landfall\Media\Sounds"
New-Item -ItemType Directory -Force $out | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType = WindowsRuntime]
$null = [Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media.MediaProperties, ContentType = WindowsRuntime]

# WinRT async calls, waited for from PowerShell 5.1
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asTaskProgress = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress`1' })[0]
function Wait-Op($op, [Type]$type) {
    $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $task.Wait() | Out-Null
    $task.Result
}
function Wait-Progress($op) {
    $task = $asTaskProgress.MakeGenericMethod([double]).Invoke($null, @($op))
    $task.Wait() | Out-Null
}

$profile = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateMp3([Windows.Media.MediaProperties.AudioEncodingQuality]::Medium)
$folder = Wait-Op ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($out)) ([Windows.Storage.StorageFolder])
$transcoder = New-Object Windows.Media.Transcoding.MediaTranscoder

Get-ChildItem $src -Filter *.wav | ForEach-Object {
    $in = Wait-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($_.FullName)) ([Windows.Storage.StorageFile])
    $name = [IO.Path]::ChangeExtension($_.Name, ".mp3")
    $dest = Wait-Op ($folder.CreateFileAsync($name, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
    $prep = Wait-Op ($transcoder.PrepareFileTranscodeAsync($in, $dest, $profile)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
    if (-not $prep.CanTranscode) { throw "can't encode $($_.Name): $($prep.FailureReason)" }
    Wait-Progress ($prep.TranscodeAsync())
    "{0,-12} {1,7:N0} bytes" -f $name, (Get-Item (Join-Path $out $name)).Length
}
