@echo off
setlocal enabledelayedexpansion

echo ==================================
echo Testing HussleMatch API Endpoints
echo ==================================
echo.

REM Test 1: Health Check
echo 1. HEALTH CHECK (No auth required)
echo ====================================
echo curl -X GET http://localhost:3000/health
curl -s -X GET "http://localhost:3000/health"
echo.
echo.

REM Test 2: Sign In (get fresh token)
echo 2. SIGN IN
echo ====================================
echo curl -X POST http://localhost:3000/auth/signin
curl -s -X POST "http://localhost:3000/auth/signin" -H "Content-Type: application/json" -d "{\"email\": \"cebo@nomail.com\", \"password\": \"Zecurepassword12345678!\"}"
echo.
echo.

REM Note about protected endpoints
echo 3. NOTE ABOUT PROTECTED ENDPOINTS
echo ====================================
echo The following endpoints require a valid Firebase ID Token:
echo   - GET /users
echo   - GET /users/:id
echo   - PUT /users/:id
echo.
echo To test these:
echo 1. Extract the customToken from the signin response above
echo 2. Exchange it for an idToken using Firebase REST API
echo 3. Use the idToken in the Authorization: Bearer header
echo.
echo Firebase Token Exchange:
echo curl -X POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyDc0PlLSb2tM_Hm6g-fXYBqG4Kx0o3aKZQ ^^
echo   -H Content-Type: application/json ^^
echo   -d "{\"token\": \"YOUR_CUSTOM_TOKEN_HERE\", \"returnSecureToken\": true}"
echo.
echo Then use the returned idToken:
echo.
echo 4. GET ALL USERS (Protected)
echo curl -X GET http://localhost:3000/users ^^
echo   -H "Authorization: Bearer YOUR_ID_TOKEN_HERE"
echo.
echo 5. GET USER BY ID (Protected)
echo curl -X GET http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2 ^^
echo   -H "Authorization: Bearer YOUR_ID_TOKEN_HERE"
echo.
echo 6. UPDATE USER PROFILE (Protected)
echo curl -X PUT http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2 ^^
echo   -H "Content-Type: application/json" ^^
echo   -H "Authorization: Bearer YOUR_ID_TOKEN_HERE" ^^
echo   -d "{\"bio\": \"Experienced freelancer\", \"skills\": [\"React\", \"Node.js\"], \"location_city\": \"Johannesburg\", \"location_country\": \"South Africa\"}"
echo.
echo ==================================
echo Tests completed!
echo ==================================
