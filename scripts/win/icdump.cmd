@echo off

if "%2" == "" (
    echo Usage: icdump node^|heap^|core CONTAINER
    exit /b 1
)

if "%1" == "node" (
    bx ic exec %2 pkill -RTMIN node
) else if "%1" == "heap" (
    bx ic exec %2 pkill -RTMIN+1 node
) else if "%1" == "core" (
    bx ic exec %2 pkill -RTMIN+2 node
 ) else (
    echo Usage: icdump node^|heap^|core CONTAINER
    exit /b 1
)