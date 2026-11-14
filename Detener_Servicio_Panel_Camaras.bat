@echo off
rem ============================================================
rem  DetenerServicio.bat
rem  Quita el inicio AUTOMATICO del servicio "PanelCamaras" (pasa a
rem  manual) y despues lo detiene. Se relanza solo como administrador.
rem  (No lo elimina. IniciarServicio.bat vuelve a ponerlo en automatico.)
rem ============================================================
setlocal
set "SVC=PanelCamaras"

rem --- Se relanza solo como ADMINISTRADOR (Windows mostrara el aviso de permisos, UAC) ---
net session >nul 2>&1
if errorlevel 1 (
    echo Solicitando permisos de administrador...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
    if errorlevel 1 (
        echo No se concedieron los permisos de administrador. No se ha hecho ningun cambio.
        pause
    )
    exit /b
)
rem Como administrador la carpeta de trabajo cambia: se vuelve a la del archivo (pushd tambien admite rutas de red UNC)
pushd "%~dp0"

sc query "%SVC%" >nul 2>&1
if errorlevel 1 (
    echo El servicio %SVC% no esta instalado.
    pause
    exit /b 1
)

rem Primero se quita el inicio automatico (manual) y luego se detiene
echo Quitando inicio automatico...
sc config "%SVC%" start= demand
if errorlevel 1 ( echo Error al cambiar el inicio del servicio. & pause & exit /b 1 )

echo Deteniendo servicio...
sc stop "%SVC%"
pause
