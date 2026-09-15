' Start start-tappenmars-buddy.bat volledig onzichtbaar (geen zwart
' consolevenster). Dit is het bestand waar de bureaubladsnelkoppeling
' naar wijst.
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptMap = fso.GetParentFolderName(WScript.ScriptFullName)
batPad = scriptMap & "\start-tappenmars-buddy.bat"
WshShell.Run """" & batPad & """", 0, False
