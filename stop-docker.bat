@echo off
setlocal

pushd "%~dp0Backend" || (
    echo ERROR: Could not find the Backend folder.
    exit /b 1
)

docker compose down
if errorlevel 1 (
    echo.
    echo ERROR: Docker Compose could not stop VisitorHub.
    echo Make sure Docker Desktop is running.
    popd
    exit /b 1
)

echo VisitorHub containers are stopped. Database data is preserved.
popd
exit /b 0
