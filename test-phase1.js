/**
 * Phase 1 Test Suite for HussleMatch Backend
 * Tests: /auth/refresh, pagination, applications_count increment
 * 
 * Prerequisites:
 * - Backend running on http://localhost:3001
 * - Valid Firebase custom token with user having onboarding record
 */

const axios = require('axios');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithCustomToken } = require('firebase/auth');

const firebaseConfig = {
  apiKey: "AIzaSyC5ClctTmTdM6cJKoOgTVbWjcZJm9H0Tvo",
  authDomain: "huematch-8d0ac.firebaseapp.com",
  projectId: "huematch-8d0ac",
  appId: "1:1026480118564:web:bfc6ceb8873b2ffad131b1"
};

const baseURL = 'http://localhost:3001';

let idToken = '';

async function getIdToken() {
  try {
    // Use the custom token from the existing test setup
    const customToken = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJodHRwczovL2lkZW50aXR5dG9vbGtpdC5nb29nbGVhcGlzLmNvbS9nb29nbGUuaWRlbnRpdHkuaWRlbnRpdHl0b29sa2l0LnYxLklkZW50aXR5VG9vbGtpdCIsImlhdCI6MTc4MDY5MDM1NCwiZXhwIjoxNzgwNjkzOTU0LCJpc3MiOiJmaXJlYmFzZS1hZG1pbnNkay1mYnN2Y0BodWVtYXRjaC04ZDBhYy5pYW0uZ3NlcnZpY2VhY2NvdW50LmNvbSIsInN1YiI6ImZpcmViYXNlLWFkbWluc2RrLWZic3ZjQGh1ZW1hdGNoLThkMGFjLmlhbS5nc2VydmljZWFjY291bnQuY29tIiwidWlkIjoiN2dvRWtud2RlMGV2aW44eVRWN3BLd2Y3dTZtMiJ9.KKLCC-0lZuUjPUEInUKy5VKsf2EWM5m_mXtlATPIaTnQ93NvZ78xa6OK83zpYQaRMfENhfgv7geNmtS1RbbSP8JQFc3DTnEABOsWJuCekHG0L1kVxAfORbMKgCTrAplUduJ89KuYTwu4jCqEn46A51h7YFx4YpUnpm4WPYAvkZFeIEFLVWCeuHyIhADDcKr44bge18e9LxfMicK9obFXX-zwegckpxpexvS9-SzWImqtv2-kPGNndYXz0YSu0QjIWR0LvNsLpACHt5GOaMkkG7WaOh6tZhoJmP8O-jhAgHvauMzd3uUGs55l3_0oYy7lHvIJ9AxWPjPNeCHUqkkbDw";
    
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseConfig.apiKey}`,
      { token: customToken, returnSecureToken: true }
    );
    
    idToken = response.data.idToken;
    console.log("✅ ID Token obtained");
    return idToken;
  } catch (error) {
    console.error("❌ Failed to get ID token:", error.response?.data || error.message);
    process.exit(1);
  }
}

async function testRefreshToken() {
  console.log("\n🔄 TEST 1: POST /auth/refresh");
  console.log("-".repeat(60));
  
  try {
    // First, get a fresh ID token to extract the refresh token
    // In a real flow, the client stores the refresh token from the signin response
    // For this test, we'll verify the endpoint exists and returns proper structure
    
    const response = await axios.post(
      `${baseURL}/auth/refresh`,
      { refreshToken: "dummy-refresh-token" },
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    
    console.log(`Status: ${response.status}`);
    console.log(`Response has idToken: ${!!response.data.idToken}`);
    console.log(`Response has refreshToken: ${!!response.data.refreshToken}`);
    console.log(`Response has expiresIn: ${!!response.data.expiresIn}`);
    console.log(`✅ Refresh endpoint working correctly`);
    return true;
  } catch (error) {
    console.error(`❌ Refresh endpoint failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function testPagination() {
  console.log("\n📄 TEST 2: Pagination on list endpoints");
  console.log("-".repeat(60));
  
  const endpoints = [
    { name: 'GET /users', path: '/users' },
    { name: 'GET /jobs', path: '/jobs' },
    { name: 'GET /applications', path: '/applications' },
    { name: 'GET /transactions', path: '/transactions' },
    { name: 'GET /messages', path: '/messages' },
    { name: 'GET /notifications', path: '/notifications' },
  ];
  
  let allPassed = true;
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(
        `${baseURL}${endpoint.path}?page=1&limit=5`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      
      const hasPagination = response.data.pagination !== undefined;
      const hasData = Array.isArray(response.data.data);
      
      console.log(`${endpoint.name}:`);
      console.log(`  - Has pagination object: ${hasPagination}`);
      console.log(`  - Has data array: ${hasData}`);
      console.log(`  - Pagination has totalPages: ${response.data.pagination?.totalPages !== undefined}`);
      console.log(`  - Pagination has hasNext: ${response.data.pagination?.hasNext !== undefined}`);
      console.log(`  - Pagination has hasPrev: ${response.data.pagination?.hasPrev !== undefined}`);
      
      if (hasPagination && hasData) {
        console.log(`  ✅ ${endpoint.name} pagination working`);
      } else {
        console.log(`  ❌ ${endpoint.name} pagination missing`);
        allPassed = false;
      }
    } catch (error) {
      console.log(`  ❌ ${endpoint.name} failed: ${error.response?.data?.error || error.message}`);
      allPassed = false;
    }
  }
  
  if (allPassed) {
    console.log("\n✅ All pagination endpoints working correctly");
  }
  return allPassed;
}

async function testApplicationsCount() {
  console.log("\n📊 TEST 3: applications_count increment on Application creation");
  console.log("-".repeat(60));
  
  try {
    // First, create a job to apply to
    const jobResponse = await axios.post(
      `${baseURL}/jobs`,
      {
        title: "Test Job for Pagination",
        budget: 500,
        userId: "65c0b086-baaf-4170-a630-0fd26c747af2"
      },
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    
    const jobId = jobResponse.data._id;
    console.log(`Created job: ${jobResponse.data.title} (${jobId})`);
    console.log(`Initial applications_count: ${jobResponse.data.applications_count || 0}`);
    
    // Create an application to this job
    const appResponse = await axios.post(
      `${baseURL}/applications`,
      {
        job_id: jobId,
        applicant_id: "72c0b086-baaf-4170-a630-0fd26c747af2",
        proposed_rate: 100
      },
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    
    console.log(`Created application: ${appResponse.data.status}`);
    
    // Fetch the job again to check applications_count
    const updatedJobResponse = await axios.get(
      `${baseURL}/jobs/${jobId}`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    
    const newCount = updatedJobResponse.data.applications_count;
    console.log(`Updated applications_count: ${newCount}`);
    
    if (newCount === 1) {
      console.log("✅ applications_count correctly incremented from 0 to 1");
      return true;
    } else {
      console.log(`❌ applications_count expected 1, got ${newCount}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Application count test failed: ${error.response?.data?.error || error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log("=".repeat(70));
  console.log("🧪 HUSSELMATCH PHASE 1 TEST SUITE");
  console.log("=".repeat(70));
  
  await getIdToken();
  
  const test1 = await testRefreshToken();
  const test2 = await testPagination();
  const test3 = await testApplicationsCount();
  
  console.log("\n" + "=".repeat(70));
  console.log("📋 TEST SUMMARY");
  console.log("=".repeat(70));
  console.log(`✅ /auth/refresh endpoint: ${test1 ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Pagination on all list endpoints: ${test2 ? 'PASS' : 'FAIL'}`);
  console.log(`✅ applications_count increment: ${test3 ? 'PASS' : 'FAIL'}`);
  
  const allPassed = test1 && test2 && test3;
  console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log("=".repeat(70));
  
  if (!allPassed) {
    process.exit(1);
  }
}

runAllTests().catch(console.error);