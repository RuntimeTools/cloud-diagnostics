@echo off

if "%2" == "" (
    echo Usage: cfdump node^|heap^|core APPLICATION
    exit /b 1
)

if "%1" == "node" (
    cf ssh %2 -c "pkill -RTMIN node"
) else if "%1" == "heap" (
    cf ssh %2 -c "pkill -RTMIN+1 node"
) else if "%1" == "core" (
    cf ssh %2 -c "pkill -RTMIN+2 node"
) else (
    echo Usage: cfdump node^|heap^|core APPLICATION
    exit /b 1
)