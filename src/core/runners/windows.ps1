# Woof Tweaks — Windows change runner.
# Reads a job (JSON) and, for each tweak ("group"), snapshots every value it will touch, writes the
# snapshot to the output file BEFORE changing anything, then makes the change. If any step of a tweak
# fails, every step of that tweak already made is restored from its snapshot (no half-applied tweaks).
# Modes: read (snapshot only), apply, restore, action. Never reads localised text where an API exists.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:Utf8 = New-Object System.Text.UTF8Encoding $false
$script:Hives = @{
  'HKCU' = [Microsoft.Win32.RegistryHive]::CurrentUser
  'HKLM' = [Microsoft.Win32.RegistryHive]::LocalMachine
  'HKCR' = [Microsoft.Win32.RegistryHive]::ClassesRoot
  'HKU'  = [Microsoft.Win32.RegistryHive]::Users
}
$script:Kinds = @{
  'dword' = [Microsoft.Win32.RegistryValueKind]::DWord
  'qword' = [Microsoft.Win32.RegistryValueKind]::QWord
  'sz' = [Microsoft.Win32.RegistryValueKind]::String
  'expandsz' = [Microsoft.Win32.RegistryValueKind]::ExpandString
  'multisz' = [Microsoft.Win32.RegistryValueKind]::MultiString
  'binary' = [Microsoft.Win32.RegistryValueKind]::Binary
}
$script:GuidRx = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

function Test-WoofAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Exe([string]$Exe, [string[]]$Argv) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $Exe @Argv 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $old }
  return @{ code = $code; out = (@($out) -join "`n") }
}
function Assert-Exe($r, [string]$What) {
  if ($r.code -ne 0) {
    $msg = ($r.out -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
    throw "$What failed (exit $($r.code)): $msg"
  }
}

# ---------- registry ----------
function Open-WoofKey([string]$Key, [bool]$Write, [bool]$Create) {
  $i = $Key.IndexOf('\')
  $hive = $script:Hives[$Key.Substring(0, $i)]
  if ($null -eq $hive) { throw "Unknown registry hive in $Key" }
  $sub = $Key.Substring($i + 1)
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, [Microsoft.Win32.RegistryView]::Registry64)
  if ($Create) { return $base.CreateSubKey($sub, $true) }
  return $base.OpenSubKey($sub, $Write)
}
function ConvertTo-RegValue($Value, $Kind) {
  switch ($Kind.ToString()) {
    'DWord' { return [int32]$Value }
    'QWord' { return [int64]$Value }
    'MultiString' { return [string[]]@($Value) }
    'Binary' { return [Convert]::FromBase64String([string]$Value) }
    default { return [string]$Value }
  }
}
function Read-Reg($op) {
  $k = Open-WoofKey $op.key $false $false
  if ($null -eq $k) { return @{ keyExists = $false; exists = $false } }
  try {
    if (@($k.GetValueNames()) -contains $op.name) {
      $kind = $k.GetValueKind($op.name)
      $v = $k.GetValue($op.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      if ($kind -eq [Microsoft.Win32.RegistryValueKind]::Binary) { $v = [Convert]::ToBase64String([byte[]]$v) }
      if ($kind -eq [Microsoft.Win32.RegistryValueKind]::MultiString) { $v = @($v) }
      return @{ keyExists = $true; exists = $true; kind = $kind.ToString(); value = $v }
    }
    return @{ keyExists = $true; exists = $false }
  } finally { $k.Close() }
}
function Write-Reg($op) {
  if ($null -eq $op.value) {
    $k = Open-WoofKey $op.key $true $false
    if ($null -ne $k) { try { $k.DeleteValue($op.name, $false) } finally { $k.Close() } }
    return
  }
  $kind = $script:Kinds[[string]$op.type]
  if ($null -eq $kind) { throw "Unknown registry type $($op.type)" }
  $k = Open-WoofKey $op.key $true $true
  try { $k.SetValue($op.name, (ConvertTo-RegValue $op.value $kind), $kind) } finally { $k.Close() }
}
function Restore-Reg($op, $snap) {
  if ($snap.exists) {
    $kind = [Microsoft.Win32.RegistryValueKind]([string]$snap.kind)
    $k = Open-WoofKey $op.key $true $true
    try { $k.SetValue($op.name, (ConvertTo-RegValue $snap.value $kind), $kind) } finally { $k.Close() }
    return
  }
  $k = Open-WoofKey $op.key $true $false
  if ($null -ne $k) {
    try { $k.DeleteValue($op.name, $false) } finally { $k.Close() }
  }
  if (-not $snap.keyExists) {
    # We created this key: remove it again, but only if nothing else has been put in it since.
    $k = Open-WoofKey $op.key $false $false
    if ($null -ne $k) {
      $empty = ($k.ValueCount -eq 0 -and $k.SubKeyCount -eq 0)
      $k.Close()
      if ($empty) {
        $i = $op.key.LastIndexOf('\')
        $parent = Open-WoofKey $op.key.Substring(0, $i) $true $false
        if ($null -ne $parent) { try { $parent.DeleteSubKey($op.key.Substring($i + 1), $false) } finally { $parent.Close() } }
      }
    }
  }
}

# ---------- flag strings inside one registry value (e.g. DirectXUserGlobalSettings "A=1;B=0;") ----------
function ConvertFrom-Flags([string]$Text) {
  $m = [ordered]@{}
  foreach ($p in ($Text -split ';')) { if ($p -match '^\s*([^=]+)=(.*)$') { $m[$Matches[1].Trim()] = $Matches[2].Trim() } }
  return $m
}
function ConvertTo-Flags($m) { return ((@($m.Keys) | ForEach-Object { "$_=$($m[$_])" }) -join ';') + ';' }
function Get-FlagNames($flags) { return @($flags.PSObject.Properties | ForEach-Object { $_.Name }) + @(if ($flags -is [hashtable]) { $flags.Keys }) | Select-Object -Unique }
function Read-RegFlags($op) {
  $s = Read-Reg $op
  $m = ConvertFrom-Flags $(if ($s.exists) { [string]$s.value } else { '' })
  $f = @{}
  foreach ($k in (Get-FlagNames $op.flags)) { if ($m.Contains($k)) { $f[$k] = $m[$k] } else { $f[$k] = $null } }
  return @{ exists = $s.exists; flags = $f }
}
function Set-FlagString($op, $m, [bool]$Existed) {
  if ($m.Count -eq 0 -and -not $Existed) {
    $k = Open-WoofKey $op.key $true $false
    if ($null -ne $k) { try { $k.DeleteValue($op.name, $false) } finally { $k.Close() } }
    return
  }
  $k = Open-WoofKey $op.key $true $true
  try { $k.SetValue($op.name, (ConvertTo-Flags $m), [Microsoft.Win32.RegistryValueKind]::String) } finally { $k.Close() }
}
function Write-RegFlags($op) {
  $s = Read-Reg $op
  $m = ConvertFrom-Flags $(if ($s.exists) { [string]$s.value } else { '' })
  foreach ($k in (Get-FlagNames $op.flags)) { $m[$k] = [string]$op.flags.$k }
  Set-FlagString $op $m $true
}
function Restore-RegFlags($op, $snap) {
  $s = Read-Reg $op
  $m = ConvertFrom-Flags $(if ($s.exists) { [string]$s.value } else { '' })
  foreach ($k in (Get-FlagNames $op.flags)) {
    $prev = $snap.flags.$k
    if ($null -eq $prev) { if ($m.Contains($k)) { $m.Remove($k) } } else { $m[$k] = [string]$prev }
  }
  Set-FlagString $op $m ([bool]$snap.exists)
}

# ---------- services ----------
$script:StartNames = @{ 2 = 'Automatic'; 3 = 'Manual'; 4 = 'Disabled'; 0 = 'Boot'; 1 = 'System' }
function Read-Service($op) {
  $s = Get-Service -Name $op.name -ErrorAction SilentlyContinue
  if ($null -eq $s) { return @{ na = $true; why = "Service $($op.name) isn't installed" } }
  $p = "Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\$($op.name)"
  $props = Get-ItemProperty -LiteralPath $p -ErrorAction SilentlyContinue
  $start = [int]$props.Start
  $delayed = ([int]$props.DelayedAutostart -eq 1)
  $type = $script:StartNames[$start]
  if ($type -eq 'Automatic' -and $delayed) { $type = 'AutomaticDelayed' }
  return @{ start = $type; status = $s.Status.ToString() }
}
function Set-ServiceStart([string]$Name, [string]$Type) {
  if ($Type -eq 'AutomaticDelayed') { Assert-Exe (Invoke-Exe 'sc.exe' @('config', $Name, 'start=', 'delayed-auto')) "Setting $Name to delayed start"; return }
  try { Set-Service -Name $Name -StartupType $Type -ErrorAction Stop }
  catch {
    $map = @{ 'Automatic' = 'auto'; 'Manual' = 'demand'; 'Disabled' = 'disabled' }
    Assert-Exe (Invoke-Exe 'sc.exe' @('config', $Name, 'start=', $map[$Type])) "Setting $Name to $Type"
  }
}
function Write-Service($op) {
  Set-ServiceStart $op.name $op.start
  if ($op.stop) { Stop-Service -Name $op.name -Force -ErrorAction SilentlyContinue }
}
function Restore-Service($op, $snap) {
  if ($snap.na) { return }
  if ($snap.start -in @('Automatic', 'AutomaticDelayed', 'Manual', 'Disabled')) { Set-ServiceStart $op.name $snap.start }
  if ($snap.status -eq 'Running') { Start-Service -Name $op.name -ErrorAction SilentlyContinue }
}

# ---------- power plans ----------
function Get-ActiveScheme {
  $r = Invoke-Exe 'powercfg.exe' @('/getactivescheme')
  Assert-Exe $r 'Reading the active power plan'
  $m = [regex]::Match($r.out, $script:GuidRx)
  if (-not $m.Success) { throw 'Could not read the active power plan' }
  return $m.Value.ToLower()
}
function Test-Scheme([string]$Guid) {
  $r = Invoke-Exe 'powercfg.exe' @('/list')
  return ($r.out.ToLower().Contains($Guid.ToLower()))
}
function Read-PowerScheme($op) { return @{ active = (Get-ActiveScheme); exists = (Test-Scheme $op.guid) } }
function Write-PowerScheme($op) {
  if (-not (Test-Scheme $op.guid)) {
    if (-not $op.template) { throw "Power plan $($op.guid) isn't available on this PC" }
    Assert-Exe (Invoke-Exe 'powercfg.exe' @('-duplicatescheme', $op.template, $op.guid)) 'Creating the power plan'
    if ($op.label) { Invoke-Exe 'powercfg.exe' @('-changename', $op.guid, $op.label, [string]$op.description) | Out-Null }
  }
  Assert-Exe (Invoke-Exe 'powercfg.exe' @('/setactive', $op.guid)) 'Switching power plan'
}
function Restore-PowerScheme($op, $snap) {
  Assert-Exe (Invoke-Exe 'powercfg.exe' @('/setactive', $snap.active)) 'Switching back to your previous power plan'
  if (-not $snap.exists -and $snap.active -ne $op.guid) { Invoke-Exe 'powercfg.exe' @('/delete', $op.guid) | Out-Null }
}
function Read-PowerSetting($op) {
  $g = $(if ($op.scheme) { ([string]$op.scheme).ToLower() } else { Get-ActiveScheme })
  $r = Invoke-Exe 'powercfg.exe' @('/query', $g, $op.sub, $op.setting)
  if ($r.code -ne 0) { return @{ na = $true; why = "This PC doesn't have that power setting" } }
  # Locale-independent: the last two 0x######## values are the AC and DC indexes.
  $m = [regex]::Matches($r.out, '0x([0-9a-fA-F]{8})')
  if ($m.Count -lt 2) { return @{ na = $true; why = "This PC doesn't have that power setting" } }
  return @{ scheme = $g; ac = [Convert]::ToInt64($m[$m.Count - 2].Groups[1].Value, 16); dc = [Convert]::ToInt64($m[$m.Count - 1].Groups[1].Value, 16) }
}
function Set-PowerIndex([string]$Scheme, $op, $Ac, $Dc) {
  if ($null -ne $Ac) { Assert-Exe (Invoke-Exe 'powercfg.exe' @('/setacvalueindex', $Scheme, $op.sub, $op.setting, [string]$Ac)) 'Changing a power setting' }
  if ($null -ne $Dc) { Assert-Exe (Invoke-Exe 'powercfg.exe' @('/setdcvalueindex', $Scheme, $op.sub, $op.setting, [string]$Dc)) 'Changing a power setting' }
  $active = Get-ActiveScheme
  if ($active -eq $Scheme) { Invoke-Exe 'powercfg.exe' @('/setactive', $Scheme) | Out-Null }
}
function Write-PowerSetting($op) { Set-PowerIndex $(if ($op.scheme) { ([string]$op.scheme).ToLower() } else { Get-ActiveScheme }) $op $op.ac $op.dc }
function Restore-PowerSetting($op, $snap) {
  if ($snap.na) { return }
  if (-not (Test-Scheme $snap.scheme)) { return }  # the plan it belonged to was already removed
  Set-PowerIndex $snap.scheme $op $snap.ac $snap.dc
}

# ---------- boot configuration (bcdedit) ----------
function Assert-NoBitLocker {
  try {
    $v = Get-CimInstance -Namespace 'root\cimv2\Security\MicrosoftVolumeEncryption' -ClassName Win32_EncryptableVolume -Filter "DriveLetter='$($env:SystemDrive)'" -ErrorAction Stop
    if ($v -and $v.ProtectionStatus -eq 1) { throw 'BitLocker/Device Encryption is on. Changing boot settings could ask for your recovery key, so Woof Tweaks will not do it.' }
  } catch [Microsoft.Management.Infrastructure.CimException] { }
}
function Read-Bcd($op) {
  $r = Invoke-Exe 'bcdedit.exe' @('/enum', '{current}')
  if ($r.code -ne 0) { return @{ unknown = $true; needsAdmin = $true } }
  foreach ($line in ($r.out -split "`n")) {
    $m = [regex]::Match($line, '^\s*' + [regex]::Escape($op.name) + '\s+(\S.*)$', 'IgnoreCase')
    if ($m.Success) { return @{ exists = $true; value = $m.Groups[1].Value.Trim() } }
  }
  return @{ exists = $false }
}
function ConvertTo-BcdBool([string]$v) {
  if ($v -match '^(yes|ja|oui|s[ií]|sim|tak|da|evet|kyll|igen|ano|はい|是|예)') { return 'yes' }
  if ($v -match '^(no|nein|non|nee|nie|ne|hay[iı]r|ei|nem|いいえ|否|아니요)') { return 'no' }
  return $v
}
function Write-Bcd($op) {
  Assert-NoBitLocker
  if ($null -eq $op.value) {
    $r = Invoke-Exe 'bcdedit.exe' @('/deletevalue', '{current}', $op.name)
    return
  }
  Assert-Exe (Invoke-Exe 'bcdedit.exe' @('/set', '{current}', $op.name, [string]$op.value)) "Changing boot setting $($op.name)"
}
function Restore-Bcd($op, $snap) {
  if ($snap.unknown) { return }
  if (-not $snap.exists) { Invoke-Exe 'bcdedit.exe' @('/deletevalue', '{current}', $op.name) | Out-Null; return }
  Assert-Exe (Invoke-Exe 'bcdedit.exe' @('/set', '{current}', $op.name, (ConvertTo-BcdBool $snap.value))) "Restoring boot setting $($op.name)"
}

# ---------- TCP/IP global settings ----------
function Read-Netsh($op) {
  switch ($op.setting) {
    'autotuninglevel' { $s = Get-NetTCPSetting -SettingName Internet -ErrorAction SilentlyContinue; if (-not $s) { $s = @(Get-NetTCPSetting)[0] }; return @{ value = [string]$s.AutoTuningLevelLocal } }
    'ecncapability' { $s = Get-NetTCPSetting -SettingName Internet -ErrorAction SilentlyContinue; if (-not $s) { $s = @(Get-NetTCPSetting)[0] }; return @{ value = [string]$s.EcnCapability } }
    'timestamps' { $s = Get-NetTCPSetting -SettingName Internet -ErrorAction SilentlyContinue; if (-not $s) { $s = @(Get-NetTCPSetting)[0] }; return @{ value = [string]$s.Timestamps } }
    'rss' { return @{ value = [string](Get-NetOffloadGlobalSetting).ReceiveSideScaling } }
    'rsc' { return @{ value = [string](Get-NetOffloadGlobalSetting).ReceiveSegmentCoalescing } }
    default { throw "Unknown TCP setting $($op.setting)" }
  }
}
function ConvertTo-NetshValue([string]$Setting, [string]$v) {
  $v = $v.ToLower()
  switch ($Setting) {
    'autotuninglevel' { if ($v -in @('disabled', 'highlyrestricted', 'restricted', 'normal', 'experimental')) { return $v } else { return 'normal' } }
    { $_ -in @('ecncapability', 'timestamps') } { if ($v -in @('enabled', 'disabled')) { return $v } else { return 'default' } }
    default { if ($v -in @('enabled', 'disabled')) { return $v } else { return 'enabled' } }
  }
}
function Set-Netsh([string]$Setting, [string]$v) {
  Assert-Exe (Invoke-Exe 'netsh.exe' @('int', 'tcp', 'set', 'global', "$Setting=$(ConvertTo-NetshValue $Setting $v)")) "Changing TCP setting $Setting"
}
function Write-Netsh($op) { Set-Netsh $op.setting ([string]$op.value) }
function Restore-Netsh($op, $snap) { Set-Netsh $op.setting ([string]$snap.value) }

# ---------- network adapters ----------
function Get-ActiveAdapters { return @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' }) }
function Read-AdapterProp($op) {
  $list = @()
  foreach ($a in (Get-ActiveAdapters)) {
    $p = Get-NetAdapterAdvancedProperty -Name $a.Name -RegistryKeyword $op.keyword -ErrorAction SilentlyContinue
    if ($null -eq $p) { continue }
    $valid = @($p.ValidRegistryValues | ForEach-Object { [string]$_ })
    $list += , @{ adapter = $a.Name; value = [string](@($p.RegistryValue)[0]); valid = $valid; max = $p.NumericParameterMaxValue; min = $p.NumericParameterMinValue }
  }
  if ($list.Count -eq 0) { return @{ na = $true; why = "Your network adapter doesn't have this setting" } }
  return @{ adapters = $list }
}
function Resolve-AdapterTarget($op, $a) {
  $t = [string]$op.value
  if ($t -eq 'max' -or $t -eq 'min') {
    $nums = @($a.valid | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int64]$_ })
    if ($nums.Count -gt 0) { if ($t -eq 'max') { return [string]($nums | Measure-Object -Maximum).Maximum } else { return [string]($nums | Measure-Object -Minimum).Minimum } }
    if ($t -eq 'max' -and $null -ne $a.max) { return [string]$a.max }
    if ($t -eq 'min' -and $null -ne $a.min) { return [string]$a.min }
    return $null
  }
  if ($a.valid.Count -gt 0 -and -not ($a.valid -contains $t)) { return $null }
  return $t
}
function Write-AdapterProp($op) {
  $snap = Read-AdapterProp $op
  foreach ($a in $snap.adapters) {
    $t = Resolve-AdapterTarget $op $a
    if ($null -eq $t -or $t -eq $a.value) { continue }
    Set-NetAdapterAdvancedProperty -Name $a.adapter -RegistryKeyword $op.keyword -RegistryValue $t -NoRestart -ErrorAction Stop
  }
}
function Restore-AdapterProp($op, $snap) {
  if ($snap.na) { return }
  foreach ($a in @($snap.adapters)) {
    $p = Get-NetAdapterAdvancedProperty -Name $a.adapter -RegistryKeyword $op.keyword -ErrorAction SilentlyContinue
    if ($null -eq $p) { continue }
    if ([string](@($p.RegistryValue)[0]) -ne [string]$a.value) {
      Set-NetAdapterAdvancedProperty -Name $a.adapter -RegistryKeyword $op.keyword -RegistryValue ([string]$a.value) -NoRestart -ErrorAction Stop
    }
  }
}

# ---------- DNS ----------
function Read-Dns($op) {
  $list = @()
  foreach ($a in (Get-ActiveAdapters)) {
    $servers = @(Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ErrorAction SilentlyContinue | ForEach-Object { $_.ServerAddresses } | Where-Object { $_ })
    $ns = (Get-ItemProperty -LiteralPath "Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$($a.InterfaceGuid)" -Name NameServer -ErrorAction SilentlyContinue).NameServer
    $list += , @{ ifIndex = [int]$a.ifIndex; adapter = $a.Name; static = [bool]($ns -and $ns.Trim()); servers = @($servers | ForEach-Object { [string]$_ }) }
  }
  if ($list.Count -eq 0) { return @{ na = $true; why = 'No connected network adapter' } }
  return @{ adapters = $list }
}
function Write-Dns($op) {
  foreach ($a in (Get-ActiveAdapters)) { Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ServerAddresses @($op.servers) -ErrorAction Stop }
  Clear-DnsClientCache -ErrorAction SilentlyContinue
}
function Restore-Dns($op, $snap) {
  if ($snap.na) { return }
  foreach ($a in @($snap.adapters)) {
    if ($a.static -and @($a.servers).Count -gt 0) { Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ServerAddresses @($a.servers) -ErrorAction Stop }
    else { Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ResetServerAddresses -ErrorAction Stop }
  }
  Clear-DnsClientCache -ErrorAction SilentlyContinue
}

# ---------- scheduled tasks ----------
function Read-Task($op) {
  $t = Get-ScheduledTask -TaskPath $op.path -TaskName $op.name -ErrorAction SilentlyContinue
  if ($null -eq $t) { return @{ na = $true; why = "Task $($op.name) isn't on this PC" } }
  return @{ state = $t.State.ToString() }
}
function Write-Task($op) {
  if ($op.enabled) { Enable-ScheduledTask -TaskPath $op.path -TaskName $op.name -ErrorAction Stop | Out-Null }
  else { Disable-ScheduledTask -TaskPath $op.path -TaskName $op.name -ErrorAction Stop | Out-Null }
}
function Restore-Task($op, $snap) {
  if ($snap.na) { return }
  if ($snap.state -eq 'Disabled') { Disable-ScheduledTask -TaskPath $op.path -TaskName $op.name -ErrorAction Stop | Out-Null }
  else { Enable-ScheduledTask -TaskPath $op.path -TaskName $op.name -ErrorAction Stop | Out-Null }
}

# ---------- memory manager ----------
function Read-MMAgent($op) {
  try { $m = Get-MMAgent -ErrorAction Stop } catch { return @{ unknown = $true; needsAdmin = $true } }
  return @{ value = [bool]$m.($op.feature) }
}
function Set-MMAgentFeature([string]$Feature, [bool]$On) {
  $p = @{ $Feature = $true; ErrorAction = 'Stop' }
  if ($On) { Enable-MMAgent @p } else { Disable-MMAgent @p }
}
function Write-MMAgent($op) { Set-MMAgentFeature $op.feature ([bool]$op.enabled) }
function Restore-MMAgent($op, $snap) { if ($null -ne $snap.value) { Set-MMAgentFeature $op.feature ([bool]$snap.value) } }

# ---------- hibernation ----------
function Read-Hibernate($op) {
  $v = (Get-ItemProperty -LiteralPath 'Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Power' -Name HibernateEnabled -ErrorAction SilentlyContinue).HibernateEnabled
  return @{ value = ([int]$v -eq 1) }
}
function Set-Hibernate([bool]$On) { Assert-Exe (Invoke-Exe 'powercfg.exe' @('/hibernate', $(if ($On) { 'on' } else { 'off' }))) 'Changing hibernation' }
function Write-Hibernate($op) { Set-Hibernate ([bool]$op.enabled) }
function Restore-Hibernate($op, $snap) { Set-Hibernate ([bool]$snap.value) }

# ---------- Microsoft Defender exclusions ----------
function Test-Defender { try { return [bool](Get-MpComputerStatus -ErrorAction Stop).AntivirusEnabled } catch { return $false } }
function Read-DefenderExclusion($op) {
  if (-not (Test-Defender)) { return @{ na = $true; why = 'Microsoft Defender isn''t your active antivirus' } }
  $pref = Get-MpPreference -ErrorAction SilentlyContinue
  $list = @($pref.ExclusionPath | Where-Object { $_ })
  if ($list.Count -eq 1 -and $list[0] -like 'N/A*') { return @{ unknown = $true; needsAdmin = $true } }
  return @{ present = [bool](@($list | Where-Object { $_.TrimEnd('\') -ieq ([string]$op.path).TrimEnd('\') }).Count) }
}
function Write-DefenderExclusion($op) { Add-MpPreference -ExclusionPath $op.path -ErrorAction Stop }
function Restore-DefenderExclusion($op, $snap) { if (-not $snap.na -and -not $snap.present) { Remove-MpPreference -ExclusionPath $op.path -ErrorAction Stop } }

# ---------- display refresh rate (primary display) ----------
function Initialize-Display {
  if ('WoofDisplay' -as [type]) { return }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WoofDisplay {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields;
    public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight;
    public int dmDisplayFlags; public int dmDisplayFrequency;
    public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType;
    public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int ChangeDisplaySettingsEx(string dev, ref DEVMODE dm, IntPtr hwnd, int flags, IntPtr param);
  static DEVMODE New() { var d = new DEVMODE(); d.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)); return d; }
  public static int[] Current() { var d = New(); if (!EnumDisplaySettings(null, -1, ref d)) return null; return new int[] { d.dmPelsWidth, d.dmPelsHeight, d.dmBitsPerPel, d.dmDisplayFrequency }; }
  public static int Max() {
    var c = Current(); if (c == null) return 0; int best = c[3];
    for (int i = 0; ; i++) { var d = New(); if (!EnumDisplaySettings(null, i, ref d)) break;
      if (d.dmPelsWidth == c[0] && d.dmPelsHeight == c[1] && d.dmBitsPerPel == c[2] && d.dmDisplayFrequency > best) best = d.dmDisplayFrequency; }
    return best;
  }
  public static int Set(int hz) {
    var c = Current(); if (c == null) return -99;
    for (int i = 0; ; i++) { var d = New(); if (!EnumDisplaySettings(null, i, ref d)) break;
      if (d.dmPelsWidth == c[0] && d.dmPelsHeight == c[1] && d.dmBitsPerPel == c[2] && d.dmDisplayFrequency == hz) {
        d.dmFields = 0x400000; return ChangeDisplaySettingsEx(null, ref d, IntPtr.Zero, 1, IntPtr.Zero); } }
    return -98;
  }
}
'@
}
function Read-Display($op) {
  Initialize-Display
  $c = [WoofDisplay]::Current()
  if ($null -eq $c) { return @{ na = $true; why = 'Could not read the display mode' } }
  return @{ hz = $c[3]; max = [WoofDisplay]::Max(); width = $c[0]; height = $c[1] }
}
function Set-DisplayHz([int]$Hz) {
  Initialize-Display
  $r = [WoofDisplay]::Set($Hz)
  if ($r -ne 0) { throw "Windows refused the display mode change (code $r)" }
}
function Write-Display($op) { $s = Read-Display $op; if ($s.max -gt $s.hz) { Set-DisplayHz $s.max } }
function Restore-Display($op, $snap) { if (-not $snap.na) { $c = Read-Display $op; if ($c.hz -ne $snap.hz) { Set-DisplayHz $snap.hz } } }

# ---------- after-change refreshes (so settings apply without signing out) ----------
function Initialize-Spi {
  if ('WoofSpi' -as [type]) { return }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WoofSpi {
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SystemParametersInfo(uint a, uint b, int[] c, uint d);
  [DllImport("user32.dll", SetLastError = true, EntryPoint = "SystemParametersInfo")] public static extern bool SystemParametersInfoPtr(uint a, uint b, IntPtr c, uint d);
}
'@
}
function Get-RegString([string]$Key, [string]$Name, [string]$Default) {
  $k = Open-WoofKey $Key $false $false
  if ($null -eq $k) { return $Default }
  try { $v = $k.GetValue($Name, $Default); return [string]$v } finally { $k.Close() }
}
function Invoke-Post($names) {
  foreach ($n in @($names)) {
    if (-not $n) { continue }
    try {
      switch ($n) {
        'mouse' {
          Initialize-Spi
          $m = 'HKCU\Control Panel\Mouse'
          $vals = [int[]]@([int](Get-RegString $m 'MouseThreshold1' '6'), [int](Get-RegString $m 'MouseThreshold2' '10'), [int](Get-RegString $m 'MouseSpeed' '1'))
          [WoofSpi]::SystemParametersInfo(0x0004, 0, $vals, 3) | Out-Null
          [WoofSpi]::SystemParametersInfoPtr(0x0071, 0, [IntPtr][int](Get-RegString $m 'MouseSensitivity' '10'), 3) | Out-Null
        }
        'keyboard' {
          Initialize-Spi
          $k = 'HKCU\Control Panel\Keyboard'
          [WoofSpi]::SystemParametersInfoPtr(0x0017, [uint32][int](Get-RegString $k 'KeyboardDelay' '1'), [IntPtr]::Zero, 3) | Out-Null
          [WoofSpi]::SystemParametersInfoPtr(0x000B, [uint32][int](Get-RegString $k 'KeyboardSpeed' '31'), [IntPtr]::Zero, 3) | Out-Null
        }
      }
    } catch { }
  }
}

# ---------- dispatch ----------
function Read-Op($op) {
  switch ($op.t) {
    'reg' { return Read-Reg $op }
    'regFlags' { return Read-RegFlags $op }
    'service' { return Read-Service $op }
    'powerScheme' { return Read-PowerScheme $op }
    'powerSetting' { return Read-PowerSetting $op }
    'bcd' { return Read-Bcd $op }
    'netsh' { return Read-Netsh $op }
    'adapterProp' { return Read-AdapterProp $op }
    'dns' { return Read-Dns $op }
    'task' { return Read-Task $op }
    'mmagent' { return Read-MMAgent $op }
    'hibernate' { return Read-Hibernate $op }
    'defenderExclusion' { return Read-DefenderExclusion $op }
    'display' { return Read-Display $op }
    default { throw "Unknown change type $($op.t)" }
  }
}
function Write-Op($op) {
  switch ($op.t) {
    'reg' { Write-Reg $op } 'regFlags' { Write-RegFlags $op } 'service' { Write-Service $op } 'powerScheme' { Write-PowerScheme $op }
    'powerSetting' { Write-PowerSetting $op } 'bcd' { Write-Bcd $op } 'netsh' { Write-Netsh $op }
    'adapterProp' { Write-AdapterProp $op } 'dns' { Write-Dns $op } 'task' { Write-Task $op }
    'mmagent' { Write-MMAgent $op } 'hibernate' { Write-Hibernate $op } 'defenderExclusion' { Write-DefenderExclusion $op }
    'display' { Write-Display $op }
    default { throw "Unknown change type $($op.t)" }
  }
}
function Restore-Op($op, $snap) {
  if ($snap.na -or $snap.unknown) { return }
  switch ($op.t) {
    'reg' { Restore-Reg $op $snap } 'regFlags' { Restore-RegFlags $op $snap } 'service' { Restore-Service $op $snap } 'powerScheme' { Restore-PowerScheme $op $snap }
    'powerSetting' { Restore-PowerSetting $op $snap } 'bcd' { Restore-Bcd $op $snap } 'netsh' { Restore-Netsh $op $snap }
    'adapterProp' { Restore-AdapterProp $op $snap } 'dns' { Restore-Dns $op $snap } 'task' { Restore-Task $op $snap }
    'mmagent' { Restore-MMAgent $op $snap } 'hibernate' { Restore-Hibernate $op $snap } 'defenderExclusion' { Restore-DefenderExclusion $op $snap }
    'display' { Restore-Display $op $snap }
    default { throw "Unknown change type $($op.t)" }
  }
}

# ---------- one-off actions (cleanup, repairs) ----------
function Expand-WoofPath([string]$p) { return [Environment]::ExpandEnvironmentVariables($p) }
function Clear-WoofFolder($paths, [int]$OlderThanHours) {
  $freed = [int64]0; $count = 0; $skipped = 0
  $cut = (Get-Date).AddHours(-$OlderThanHours)
  foreach ($raw in @($paths)) {
    $p = Expand-WoofPath $raw
    if (-not (Test-Path -LiteralPath $p)) { continue }
    foreach ($f in (Get-ChildItem -LiteralPath $p -Recurse -Force -File -ErrorAction SilentlyContinue)) {
      if ($f.LastWriteTime -gt $cut) { $skipped++; continue }
      try { $len = $f.Length; Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop; $freed += $len; $count++ } catch { $skipped++ }
    }
    # Empty sub-folders left behind (deepest first); the folder itself is kept.
    Get-ChildItem -LiteralPath $p -Recurse -Force -Directory -ErrorAction SilentlyContinue | Sort-Object { $_.FullName.Length } -Descending |
      ForEach-Object { try { if (-not (Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction Stop)) { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop } } catch { } }
  }
  return @{ freed = $freed; files = $count; skipped = $skipped }
}
function Invoke-Action($a) {
  switch ($a.kind) {
    'restorePoint' {
      try { Enable-ComputerRestore -Drive "$($env:SystemDrive)\" -ErrorAction SilentlyContinue } catch { }
      $before = @(Get-ComputerRestorePoint -ErrorAction SilentlyContinue).Count
      Checkpoint-Computer -Description ([string]$a.description) -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop -WarningVariable w 3>$null
      $after = @(Get-ComputerRestorePoint -ErrorAction SilentlyContinue).Count
      if ($after -le $before) { return @{ created = $false; message = 'Windows only allows one restore point every 24 hours, and there is already a recent one. Your Woof Tweaks backup still covers every change.' } }
      return @{ created = $true }
    }
    'flushDns' { Clear-DnsClientCache -ErrorAction SilentlyContinue; Assert-Exe (Invoke-Exe 'ipconfig.exe' @('/flushdns')) 'Flushing DNS'; return @{ } }
    'networkReset' {
      Assert-Exe (Invoke-Exe 'netsh.exe' @('winsock', 'reset')) 'Resetting Winsock'
      Invoke-Exe 'netsh.exe' @('int', 'ip', 'reset') | Out-Null
      return @{ reboot = $true }
    }
    'clearFolders' { return (Clear-WoofFolder $a.paths ([int]$a.olderThanHours)) }
    'clearUpdateCache' {
      $was = (Get-Service wuauserv -ErrorAction SilentlyContinue).Status
      Stop-Service wuauserv -Force -ErrorAction SilentlyContinue
      Stop-Service bits -Force -ErrorAction SilentlyContinue
      try { $r = Clear-WoofFolder @("$env:SystemRoot\SoftwareDistribution\Download") 0 }
      finally { if ($was -eq 'Running') { Start-Service wuauserv -ErrorAction SilentlyContinue } }
      return $r
    }
    'recycleBin' { Clear-RecycleBin -Force -ErrorAction SilentlyContinue; return @{ } }
    'retrim' {
      $vol = Get-Volume -DriveLetter ($env:SystemDrive.TrimEnd(':')) -ErrorAction Stop
      Optimize-Volume -DriveLetter $vol.DriveLetter -ReTrim -ErrorAction Stop
      return @{ }
    }
    'sfc' { $r = Invoke-Exe "$env:SystemRoot\System32\sfc.exe" @('/scannow'); return @{ code = $r.code; tail = (($r.out -replace "`0", '') -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 3) -join ' ' } }
    'dism' { $r = Invoke-Exe "$env:SystemRoot\System32\dism.exe" @('/Online', '/Cleanup-Image', '/RestoreHealth'); Assert-Exe $r 'DISM repair'; return @{ code = $r.code } }
    'removeAppx' {
      $removed = @()
      foreach ($n in @($a.names)) {
        $pk = Get-AppxPackage -Name $n -ErrorAction SilentlyContinue
        foreach ($p in @($pk)) { try { Remove-AppxPackage -Package $p.PackageFullName -ErrorAction Stop; $removed += $n } catch { } }
      }
      return @{ removed = $removed }
    }
    'purgeStandby' {
      if (-not ('WoofMem' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WoofMem {
  [StructLayout(LayoutKind.Sequential, Pack = 1)] struct TokPriv1Luid { public int Count; public long Luid; public int Attr; }
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr h, int acc, out IntPtr tok);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool LookupPrivilegeValue(string host, string name, out long luid);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool AdjustTokenPrivileges(IntPtr tok, bool all, ref TokPriv1Luid newst, int len, IntPtr prev, IntPtr relen);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("ntdll.dll")] static extern uint NtSetSystemInformation(int infoClass, ref int info, int length);
  public static uint PurgeStandby() {
    IntPtr tok; if (!OpenProcessToken(GetCurrentProcess(), 0x28, out tok)) return 0xFFFFFFFF;
    var tp = new TokPriv1Luid(); tp.Count = 1; tp.Attr = 2;
    if (!LookupPrivilegeValue(null, "SeProfileSingleProcessPrivilege", out tp.Luid)) return 0xFFFFFFFE;
    AdjustTokenPrivileges(tok, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
    int cmd = 4; // MemoryPurgeStandbyList
    return NtSetSystemInformation(80, ref cmd, 4);
  }
}
'@
      }
      $before = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
      $r = [WoofMem]::PurgeStandby()
      if ($r -ne 0) { throw ('Windows refused to clear standby memory (0x{0:X})' -f $r) }
      $after = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
      return @{ freed = [int64](($after - $before) * 1024) }
    }
    'listAppx' {
      $found = @()
      foreach ($n in @($a.names)) { if (Get-AppxPackage -Name $n -ErrorAction SilentlyContinue) { $found += $n } }
      return @{ found = $found }
    }
    default { throw "Unknown action $($a.kind)" }
  }
}

# ---------- main ----------
function Save-WoofOut($Out, [string]$OutFile) {
  $json = ConvertTo-Json -InputObject $Out -Depth 14 -Compress
  $tmp = "$OutFile.tmp"
  [IO.File]::WriteAllText($tmp, $json, $script:Utf8)
  Move-Item -LiteralPath $tmp -Destination $OutFile -Force
}

function Invoke-WoofRunner([string]$InFile, [string]$OutFile) {
  $job = [IO.File]::ReadAllText($InFile, $script:Utf8) | ConvertFrom-Json
  $out = @{ done = $false; admin = (Test-WoofAdmin); groups = @() }
  Save-WoofOut $out $OutFile
  foreach ($g in @($job.groups)) {
    $res = @{ id = $g.id; ok = $true; error = $null; results = @() }
    $out.groups += , $res
    if ($job.mode -eq 'read') {
      foreach ($op in @($g.ops)) {
        try { $res.results += , @{ snap = (Read-Op $op) } } catch { $res.results += , @{ error = $_.Exception.Message } }
      }
    } elseif ($job.mode -eq 'apply') {
      $done = New-Object System.Collections.ArrayList
      try {
        foreach ($op in @($g.ops)) {
          $snap = Read-Op $op
          $r = @{ snap = $snap }
          $res.results += , $r
          Save-WoofOut $out $OutFile  # the snapshot is on disk before anything changes
          if ($snap.na) { $r.na = $true; continue }
          if ($snap.unknown) { throw 'Could not read the current setting, so nothing was changed.' }
          Write-Op $op
          [void]$done.Add(@{ op = $op; snap = $snap })
        }
        Invoke-Post $g.post
      } catch {
        $res.ok = $false
        $res.error = $_.Exception.Message
        for ($i = $done.Count - 1; $i -ge 0; $i--) { try { Restore-Op $done[$i].op $done[$i].snap } catch { $res.rollbackError = $_.Exception.Message } }
        Invoke-Post $g.post
        $res.rolledBack = $true
      }
    } elseif ($job.mode -eq 'restore') {
      $ops = @($g.ops); $snaps = @($g.snaps)
      for ($i = $ops.Count - 1; $i -ge 0; $i--) {
        try { Restore-Op $ops[$i] $snaps[$i]; $res.results += , @{ ok = $true } }
        catch { $res.ok = $false; $res.error = $_.Exception.Message; $res.results += , @{ ok = $false; error = $_.Exception.Message } }
      }
      Invoke-Post $g.post
    } elseif ($job.mode -eq 'action') {
      try { $res.data = Invoke-Action $g.action } catch { $res.ok = $false; $res.error = $_.Exception.Message }
    }
    Save-WoofOut $out $OutFile
  }
  $out.done = $true
  Save-WoofOut $out $OutFile
}
