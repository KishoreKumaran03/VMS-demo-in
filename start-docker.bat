@echo off
setlocal

pushd "%~dp0Backend" || (
    echo ERROR: Could not find the Backend folder.
    exit /b 1
)

if not exist ".env" (
    echo ERROR: Backend\.env was not found.
    echo Copy Backend\.env.example to Backend\.env, set POSTGRES_PASSWORD and JWT_SECRET, then run this script again.
    popd
    exit /b 1
)

docker compose up --build -d
if errorlevel 1 (
    echo.
    echo ERROR: Docker Compose could not start VisitorHub.
    echo Make sure Docker Desktop is running and Backend\.env is configured.
    popd
    exit /b 1
)

echo.
echo VisitorHub services are running.
echo Staff dashboard: http://localhost:3000
echo Visitor kiosk:   http://localhost:3001
echo API health: http://localhost:8000/api/v1/health
echo API docs:   http://localhost:8000/docs
echo Run stop-docker.bat to stop the containers. Database data is preserved.
popd
exit /b 0
