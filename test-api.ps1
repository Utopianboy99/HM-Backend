Write-Host "=================================="
Write-Host "🧪 HussleMatch API Testing Guide"
Write-Host "=================================="
Write-Host ""

# Test 1: Health Check (No auth required)
Write-Host ""
Write-Host "1️⃣  HEALTH CHECK (No auth required)"
Write-Host "====================================="
Write-Host 'Testing: curl -X GET http://localhost:3000/health'
Write-Host ""
Write-Host "Running test..."
$healthResponse = Invoke-WebRequest -Uri "http://localhost:3000/health" -Method GET -ContentType "application/json" -ErrorAction SilentlyContinue
Write-Host ($healthResponse.Content | ConvertFrom-Json | ConvertTo-Json)
Write-Host ""

# Test 2: Sign In
Write-Host ""
Write-Host "2️⃣  SIGN IN (Get fresh token)"
Write-Host "====================================="
Write-Host 'Testing: curl -X POST http://localhost:3000/auth/signin'
Write-Host ""
Write-Host "Running test..."
$signinBody = @{
    email = "cebo@nomail.com"
    password = "Zecurepassword12345678!"
} | ConvertTo-Json

try {
    $signinResponse = Invoke-WebRequest -Uri "http://localhost:3000/auth/signin" -Method POST -ContentType "application/json" -Body $signinBody -ErrorAction Stop
    $signinContent = $signinResponse.Content | ConvertFrom-Json
    Write-Host ($signinContent | ConvertTo-Json)
    $customToken = $signinContent.customToken
    Write-Host ""
    Write-Host "✅ Custom Token extracted: $($customToken.Substring(0, 50))..."
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
}
Write-Host ""

# Test 3: Get All Users
Write-Host ""
Write-Host "3️⃣  GET ALL USERS"
Write-Host "====================================="
Write-Host 'Testing: curl -X GET http://localhost:3000/users'
Write-Host ""
Write-Host "Running test..."
try {
    $usersResponse = Invoke-WebRequest -Uri "http://localhost:3000/users" -Method GET -ContentType "application/json" -ErrorAction Stop
    Write-Host ($usersResponse.Content | ConvertFrom-Json | ConvertTo-Json)
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
}
Write-Host ""

# Test 4: Get User by ID
Write-Host ""
Write-Host "4️⃣  GET USER BY ID"
Write-Host "====================================="
Write-Host 'Testing: curl -X GET http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2'
Write-Host ""
Write-Host "Running test..."
try {
    $userResponse = Invoke-WebRequest -Uri "http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2" -Method GET -ContentType "application/json" -ErrorAction Stop
    Write-Host ($userResponse.Content | ConvertFrom-Json | ConvertTo-Json)
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
}
Write-Host ""

# Test 5: Update User Profile
Write-Host ""
Write-Host "5️⃣  UPDATE USER PROFILE"
Write-Host "====================================="
Write-Host 'Testing: curl -X PUT http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2'
Write-Host ""
Write-Host "Running test..."

$updateBody = @{
    bio = "Experienced freelancer looking for projects"
    skills = @("React", "Node.js", "MongoDB")
    location_city = "Johannesburg"
    location_country = "South Africa"
} | ConvertTo-Json

try {
    $updateResponse = Invoke-WebRequest -Uri "http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2" -Method PUT -ContentType "application/json" -Body $updateBody -ErrorAction Stop
    Write-Host ($updateResponse.Content | ConvertFrom-Json | ConvertTo-Json)
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
}
Write-Host ""

Write-Host ""
Write-Host "=================================="
Write-Host "✅ All tests completed!"
Write-Host "=================================="
