@echo off
rem ============================================================
rem  PararServicio.bat
rem  Quita el inicio AUTOMATICO del servicio "PanelCamaras" (pasa a
rem  manual) y despues lo detiene. Requiere administrador.
rem  (No lo elimina. IniciarServicio.bat vuelve a ponerlo en automatico.)
rem ============================================================
setlocal
set "SVC=PanelCamaras"

net session >nul 2>&1
if errorlevel 1 (
    echo Ejecuta este archivo como ADMINISTRADOR.
    pause
    exit /b 1
)

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
