@echo off

if "%2" == "" (
    echo Usage: kbdump node^|heap^|core POD [CONTAINER]
    exit /b 1
)

if "%3" == "" (
    rem dump type and pod parameters supplied
    if "%1" == "node" (
        kubectl exec %2 -- pkill -RTMIN node
    ) else if "%1" == "heap" (
        kubectl exec %2 -- pkill -RTMIN+1 node
    ) else if "%1" == "core" (
        kubectl exec %2 -- pkill -RTMIN+2 node
    ) else (
        echo Usage: kbdump node^|heap^|core POD [CONTAINER]
        exit /b 1
    )
) else (
    rem dump type, pod and container parameters supplied
    if "%1" == "node" (
        kubectl exec %2 -c %3 -- pkill -RTMIN node
    ) else if "%1" == "heap" (
        kubectl exec %2 -c %3 -- pkill -RTMIN+1 node
    ) else if "%1" == "core" (
        kubectl exec %2 -c %3 -- pkill -RTMIN+2 node
    ) else (
        echo Usage: kbdump node^|heap^|core POD [CONTAINER]
        exit /b 1
    )
)