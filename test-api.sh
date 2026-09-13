#!/bin/bash

echo "=================================="
echo "🧪 HussleMatch API Testing Guide"
echo "=================================="
echo ""

# Test 1: Health Check (No auth required)
echo ""
echo "1️⃣  HEALTH CHECK (No auth required)"
echo "====================================="
echo "curl -X GET \"http://localhost:3000/health\""
echo ""
echo "Running test..."
curl -X GET "http://localhost:3000/health" | jq .
echo ""

# Test 2: Sign In
echo ""
echo "2️⃣  SIGN IN (Get fresh token)"
echo "====================================="
SIGNIN_CMD='curl -X POST "http://localhost:3000/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"cebo@nomail.com\",
    \"password\": \"Zecurepassword12345678!\"
  }"'
echo "$SIGNIN_CMD"
echo ""
echo "Running test..."
SIGNIN_RESPONSE=$(curl -s -X POST "http://localhost:3000/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cebo@nomail.com",
    "password": "Zecurepassword12345678!"
  }')
echo "$SIGNIN_RESPONSE" | jq .
echo ""

# Extract custom token
CUSTOM_TOKEN=$(echo "$SIGNIN_RESPONSE" | jq -r '.customToken')
echo "✅ Custom Token extracted: ${CUSTOM_TOKEN:0:50}..."
echo ""

# Test 3: Get All Users (No specific auth in code)
echo ""
echo "3️⃣  GET ALL USERS"
echo "====================================="
echo "curl -X GET \"http://localhost:3000/users\""
echo ""
echo "Running test..."
curl -s -X GET "http://localhost:3000/users" | jq .
echo ""

# Test 4: Get User by ID
echo ""
echo "4️⃣  GET USER BY ID"
echo "====================================="
echo "curl -X GET \"http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2\""
echo ""
echo "Running test..."
curl -s -X GET "http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2" | jq .
echo ""

# Test 5: Update User Profile
echo ""
echo "5️⃣  UPDATE USER PROFILE"
echo "====================================="
echo "curl -X PUT \"http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{
    \"bio\": \"Experienced freelancer looking for projects\",
    \"skills\": [\"React\", \"Node.js\", \"MongoDB\"],
    \"location_city\": \"Johannesburg\",
    \"location_country\": \"South Africa\"
  }'"
echo ""
echo "Running test..."
curl -s -X PUT "http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2" \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "Experienced freelancer looking for projects",
    "skills": ["React", "Node.js", "MongoDB"],
    "location_city": "Johannesburg",
    "location_country": "South Africa"
  }' | jq .
echo ""

echo ""
echo "=================================="
echo "✅ All tests completed!"
echo "=================================="
