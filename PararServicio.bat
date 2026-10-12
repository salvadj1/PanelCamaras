@echo off
rem ============================================================
rem  PararServicio.bat
rem  Detiene el servicio "CentroSeguridad". Requiere administrador.
rem  (No lo elimina ni cambia su inicio automatico.)
rem ============================================================
setlocal
set "SVC=CentroSeguridad"

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

sc stop "%SVC%"
pause
