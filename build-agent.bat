@echo off
title Snap-Task Agent Builder
echo ==========================================
echo   Snap-Task 로컬 에이전트 빌드 (EXE)
echo ==========================================
echo.
echo 1. 필요한 빌드 도구(pkg)를 설치하는 중입니다...
call npm install -g pkg

echo.
echo 2. yt-agent.exe 파일을 생성하는 중입니다...
call npm run build

if %errorlevel% neq 0 (
    echo.
    echo [오류] 빌드에 실패했습니다.
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo   빌드 완료: yt-agent.exe
echo ==========================================
echo.
pause
