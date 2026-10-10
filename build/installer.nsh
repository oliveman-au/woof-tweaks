; Woof Tweaks uninstall: also remove the hidden background updater (Task Scheduler task + login item).
!macro customUnInstall
  nsExec::Exec 'schtasks /Delete /F /TN "Woof Tweaks Updater"'
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WoofTweaksUpdater"
!macroend
