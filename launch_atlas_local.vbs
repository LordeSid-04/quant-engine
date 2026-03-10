Option Explicit

Dim shell, fso, rootDir, backendDir
Dim frontendCheck, backendCheck
Dim frontendCmd, backendCmd

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
backendDir = rootDir & "\backend"

' Start frontend only if port 5173 is not already listening.
frontendCheck = shell.Run("cmd /c netstat -ano | findstr /R /C:"":5173 .*LISTENING"" >nul", 0, True)
If frontendCheck <> 0 Then
  frontendCmd = "cmd /c cd /d """ & rootDir & """ && run_frontend_local.bat"
  shell.Run frontendCmd, 0, False
End If

' Start backend only if port 8000 is not already listening.
backendCheck = shell.Run("cmd /c netstat -ano | findstr /R /C:"":8000 .*LISTENING"" >nul", 0, True)
If backendCheck <> 0 Then
  backendCmd = "cmd /c cd /d """ & backendDir & """ && run_backend_local.bat"
  shell.Run backendCmd, 0, False
End If

' Give services a moment to boot, then open browser once.
WScript.Sleep 5000
shell.Run "http://127.0.0.1:5173", 1, False
