@echo off
setlocal
title Snap-Task Starter Builder (C#)

echo ==========================================
echo   Snap-Task 스타터 빌드 (st-starter.exe)
echo ==========================================
echo.

:: 윈도우 내장 C# 컴파일러 경로 설정
set "CSC_PATH=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if not exist "%CSC_PATH%" (
    echo [오류] 시스템에서 C# 컴파일러를 찾을 수 없습니다.
    echo 경로 확인 필요: %CSC_PATH%
    pause
    exit /b 1
)

echo 1. 스타터 컴파일 중...
:: /target:winexe 를 쓰면 터미널 창 없이 실행되지만, 로그 확인을 위해 /target:exe 사용
:: /out:st-starter.exe
"%CSC_PATH%" /out:..\..\dist\st-starter.exe /target:exe starter.cs

if %errorlevel% neq 0 (
    echo.
    echo [오류] 컴파일에 실패했습니다. 코드를 확인해 주세요.
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo   빌드 완료: st-starter.exe
echo   용량 확인: 
dir ..\..\dist\st-starter.exe | findstr "st-starter.exe"
echo ==========================================
echo.
pause
