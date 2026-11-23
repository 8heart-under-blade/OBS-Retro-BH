@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "BUNDLE_ROOT=%~dp0"
set "NODE_EXE=%BUNDLE_ROOT%runtime\node.exe"
set "PORTABLE_ENTRY=%BUNDLE_ROOT%app\scripts\portable.mjs"

if not exist "%NODE_EXE%" (
    echo OBS Retro-BH: bundled Node runtime not found: "%NODE_EXE%" >&2
    exit /b 1
)

if not exist "%PORTABLE_ENTRY%" (
    echo OBS Retro-BH: portable entry not found: "%PORTABLE_ENTRY%" >&2
    exit /b 1
)

"%NODE_EXE%" "%PORTABLE_ENTRY%" %*
set "EXIT_CODE=%ERRORLEVEL%"
exit /b %EXIT_CODE%
