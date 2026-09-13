const axios = require('axios');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithCustomToken } = require('firebase/auth');

const customToken = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL2lkZW50aXR5dG9vbGtpdC5nb29nbGVhcGlzLmNvbS9nb29nbGUuaWRlbnRpdHkuaWRlbnRpdHl0b29sa2l0LnYxLklkZW50aXR5VG9vbGtpdCIsImlhdCI6MTc4MDY5MDM1NCwiZXhwIjoxNzgwNjkzOTU0LCJpc3MiOiJmaXJlYmFzZS1hZG1pbnNkay1mYnN2Y0BodWVtYXRjaC04ZDBhYy5pYW0uZ3NlcnZpY2VhY2NvdW50LmNvbSIsInN1YiI6ImZpcmViYXNlLWFkbWluc2RrLWZic3ZjQGh1ZW1hdGNoLThkMGFjLmlhbS5nc2VydmljZWFjY291bnQuY29tIiwidWlkIjoiN2dvRWtud2RlMGV2aW44eVRWN3BLd2Y3dTZtMiJ9.KKLCC-0lZuUjPUEInUKy5VKsf2EWM5m_mXtlATPIaTnQ93NvZ78xa6OK83zpYQaRMfENhfgv7geNmtS1RbbSP8JQFc3DTnEABOsWJuCekHG0L1kVxAfORbMKgCTrAplUduJ89KuYTwu4jCqEn46A51h7YFx4YpUnpm4WPYAvkZFeIEFLVWCeuHyIhADDcKr44bge18e9LxfMicK9obFXX-zwegckpxpexvS9-SzWImqtv2-kPGNndYXz0YSu0QjIWR0LvNsLpACHt5GOaMkkG7WaOh6tZhoJmP8O-jhAgHvauMzd3uUGs55l3_0oYy7lHvIJ9AxWPjPNeCHUqkkbDw";
const userId = "72c0b086-baaf-4170-a630-0fd26c747af2";
const firebaseUid = "7goEknwde0evin8yTV7pKwf7u6m2";
const email = "cebo@nomail.com";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDc0PlLSb2tM_Hm6g-fXYBqG4Kx0o3aKZQ",
  authDomain: "huematch-8d0ac.firebaseapp.com",
  projectId: "huematch-8d0ac",
  storageBucket: "huematch-8d0ac.appspot.com",
  messagingSenderId: "816087234561",
  appId: "1:816087234561:web:5c0e5c0e5c0e5c0e5c0e5c"
};

async function getIdToken() {
  try {
    console.log("\n🔐 Exchanging custom token for ID token...");
    
    // Create ID token from custom token using Firebase REST API
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyAjUGBcF2VCNK9FPTsZRdBqKgvfQ8oXFWE`,
      {
        token: customToken,
        returnSecureToken: true
      }
    );
    
    const idToken = response.data.idToken;
    console.log("✅ ID Token received!");
    console.log(`\n📋 ID Token:\n${idToken}\n`);
    return idToken;
  } catch (error) {
    console.error("❌ Failed to get ID token:", error.response?.data || error.message);
    process.exit(1);
  }
}

async function runTests() {
  const idToken = await getIdToken();
  
  console.log("\n" + "=".repeat(70));
  console.log("🧪 TESTING ENDPOINTS WITH CURL");
  console.log("=".repeat(70));
  
  // Test 1: Get user by ID
  console.log("\n\n1️⃣  GET USER BY ID");
  console.log("-".repeat(70));
  console.log(`curl -X GET "http://localhost:3000/users/${userId}" \\`);
  console.log(`  -H "Authorization: Bearer ${idToken}"`);
  console.log("\n📝 You can test this with:");
  console.log(`curl -X GET "http://localhost:3000/users/${userId}" \\`);
  console.log(`  -H "Authorization: Bearer ${idToken}"`);
  
  // Test 2: Update user profile
  console.log("\n\n2️⃣  UPDATE USER PROFILE");
  console.log("-".repeat(70));
  console.log(`curl -X PUT "http://localhost:3000/users/${userId}" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "Authorization: Bearer ${idToken}" \\`);
  console.log(`  -d '{
    "bio": "Experienced freelancer looking for projects",
    "skills": ["React", "Node.js", "MongoDB"],
    "location_city": "Johannesburg",
    "location_country": "South Africa"
  }'`);
  
  // Test 3: Get all users
  console.log("\n\n3️⃣  GET ALL USERS");
  console.log("-".repeat(70));
  console.log(`curl -X GET "http://localhost:3000/users" \\`);
  console.log(`  -H "Authorization: Bearer ${idToken}"`);
  
  // Test 4: Sign in (doesn't require ID token)
  console.log("\n\n4️⃣  SIGN IN");
  console.log("-".repeat(70));
  console.log(`curl -X POST "http://localhost:3000/auth/signin" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{
    "email": "${email}",
    "password": "Zecurepassword12345678!"
  }'`);
  
  console.log("\n\n" + "=".repeat(70));
  console.log("💡 NEXT STEPS:");
  console.log("=".repeat(70));
  console.log("1. Copy the ID Token above");
  console.log("2. Use it in the Authorization header for protected endpoints");
  console.log("3. Run the curl commands in your terminal");
  console.log("4. The token is valid for 1 hour");
  console.log("\n");
}

runTests().catch(console.error);
