@echo off
rem ============================================================
rem  IniciarServicio.bat
rem  Registra (si no existe) el servicio "PanelCamaras", lo deja
rem  en inicio AUTOMATICO con Windows y lo inicia ahora.
rem  Debe estar junto a PanelCamaras.exe. Requiere administrador.
rem ============================================================
setlocal
set "SVC=PanelCamaras"
set "EXE=%~dp0PanelCamaras.exe"

net session >nul 2>&1
if errorlevel 1 (
    echo Ejecuta este archivo como ADMINISTRADOR.
    pause
    exit /b 1
)

if not exist "%EXE%" (
    echo No se encuentra "%EXE%".
    pause
    exit /b 1
)

sc query "%SVC%" >nul 2>&1
if errorlevel 1 (
    echo Creando servicio %SVC%...
    sc create "%SVC%" binPath= "\"%EXE%\"" start= auto DisplayName= "PanelCamaras"
    if errorlevel 1 ( echo Error al crear el servicio. & pause & exit /b 1 )
    sc description "%SVC%" "Panel web PanelCamaras (ASP.NET Core)" >nul
) else (
    echo El servicio ya existe. Asegurando inicio automatico...
    sc config "%SVC%" binPath= "\"%EXE%\"" start= auto >nul
)

rem Regla de firewall para acceder desde otros equipos (TCP 7000 y 7001, entrada)
rem (se elimina tambien la regla con el nombre antiguo, si existiera)
netsh advfirewall firewall delete rule name="Centro de Seguridad (5000)" >nul 2>&1
netsh advfirewall firewall delete rule name="PanelCamaras (5000)" >nul 2>&1
netsh advfirewall firewall delete rule name="PanelCamaras (5001)" >nul 2>&1
netsh advfirewall firewall delete rule name="PanelCamaras (7000)" >nul 2>&1
netsh advfirewall firewall delete rule name="PanelCamaras (7001)" >nul 2>&1
netsh advfirewall firewall add rule name="PanelCamaras (7000)" dir=in action=allow protocol=TCP localport=7000 >nul
netsh advfirewall firewall add rule name="PanelCamaras (7001)" dir=in action=allow protocol=TCP localport=7001 >nul
if errorlevel 1 ( echo Aviso: no se pudo crear la regla de firewall. ) else ( echo Reglas de firewall creadas: puertos 7000 y 7001. )

rem Reinicio automatico ante fallos (1 min, 3 veces)
sc failure "%SVC%" reset= 86400 actions= restart/60000/restart/60000/restart/60000 >nul

sc query "%SVC%" | find "RUNNING" >nul
if errorlevel 1 (
    echo Iniciando servicio...
    sc start "%SVC%"
) else (
    echo El servicio ya esta en ejecucion.
)

echo.
echo Listo. Abre: http://localhost:7000
echo Desde otros equipos: https://IP-DE-ESTE-PC:7001 (aceptar el aviso del certificado la primera vez) (usa ipconfig para ver la IP)
pause
