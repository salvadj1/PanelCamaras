@echo off
rem ============================================================
rem  IniciarServicio.bat
rem  Registra (si no existe) el servicio "CentroSeguridad", lo deja
rem  en inicio AUTOMATICO con Windows y lo inicia ahora.
rem  Debe estar junto a CentroSeguridad.exe. Requiere administrador.
rem ============================================================
setlocal
set "SVC=CentroSeguridad"
set "EXE=%~dp0CentroSeguridad.exe"

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
    sc create "%SVC%" binPath= "\"%EXE%\"" start= auto DisplayName= "Centro de Seguridad"
    if errorlevel 1 ( echo Error al crear el servicio. & pause & exit /b 1 )
    sc description "%SVC%" "Panel web Centro de Seguridad (ASP.NET Core)" >nul
) else (
    echo El servicio ya existe. Asegurando inicio automatico...
    sc config "%SVC%" binPath= "\"%EXE%\"" start= auto >nul
)

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
echo Listo. Abre: http://localhost:5000
pause
