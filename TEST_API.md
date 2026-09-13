# HussleMatch API Testing Guide

## Quick Start Testing

### 1. Sign Up (Create New Account)
```bash
curl -X POST "http://localhost:3000/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "busa@nomail.com",
    "password": "Zecurepassword12345678!",
    "full_name": "Busa Madlanga",
    "role": "client",
    "phone": "+27820987675"
  }'
```
**Response includes:**
- `user.id` - Copy this for later use
- `user.firebase_uid`
- `customToken` - For frontend Firebase integration

---

### 2. Sign In (Existing User)
```bash
curl -X POST "http://localhost:3000/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cebo@nomail.com",
    "password": "Zecurepassword12345678!"
  }'
```
**Response includes:**
- `customToken` - Use to get Firebase ID token
- `user` - User details

**✅ TESTED & WORKING**

---

### 3. Health Check (No Auth Required)
```bash
curl -X GET "http://localhost:3000/health"
```

**✅ TESTED & WORKING**

---

## Testing Protected Endpoints

**IMPORTANT:** All protected endpoints require a valid Firebase ID token in the `Authorization: Bearer` header.

### Step 1: Sign In & Get Custom Token
```bash
curl -X POST "http://localhost:3000/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cebo@nomail.com",
    "password": "Zecurepassword12345678!"
  }'
```

Extract `customToken` from response.

### Step 2: Exchange Custom Token for ID Token

Use the Firebase REST API to exchange the custom token for an ID token:

```bash
curl -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyDc0PlLSb2tM_Hm6g-fXYBqG4Kx0o3aKZQ" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_CUSTOM_TOKEN_HERE",
    "returnSecureToken": true
  }'
```

Extract `idToken` from response and use in all protected endpoint calls.

### Step 3: Use ID Token for Protected Endpoints

---

## Protected Endpoints

### Get All Users
```bash
curl -X GET "http://localhost:3000/users" \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE"
```

---

### Get User by ID
```bash
curl -X GET "http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2" \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE"
```

---

### Update User Profile
```bash
curl -X PUT "http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE" \
  -d '{
    "bio": "Senior React developer with 5 years experience",
    "skills": ["React", "Node.js", "MongoDB"],
    "location_city": "Johannesburg",
    "location_country": "South Africa"
  }'
```

---

### Delete User (Soft Delete)
```bash
curl -X DELETE "http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2" \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE"
```

---

## Common Error Responses

| Status | Error | Meaning |
|--------|-------|---------|
| 400 | Missing required fields | Check your request body |
| 401 | Invalid credentials | Wrong email/password |
| 401 | Missing Authorization header | Add Bearer token |
| 401 | Invalid token | Token expired or malformed |
| 409 | Email already exists | Use different email |
| 429 | Too many requests | Rate limited (20/15min) |
| 500 | Server error | Check server logs |

---

## Testing Workflow

✅ **Recommended order:**
1. **Health Check** → Verify server is running
2. **Sign In** → Get credentials and custom token
3. **Exchange Token** → Get Firebase ID token
4. **Get All Users** → Test protected GET endpoint
5. **Get User by ID** → Test protected GET with ID
6. **Update User** → Test protected PUT endpoint

---

## Tips for Testing

✅ **Keep track of:**
- User ID (for protected endpoints): `72c0b086-baaf-4170-a630-0fd26c747af2`
- Firebase ID token (changes each time you sign in, valid for 1 hour)
- Auth endpoints limited to 20 requests per 15 minutes

✅ **Token Management:**
- Custom token is short-lived (1 hour)
- Exchange for ID token to access protected endpoints
- ID tokens expire after 1 hour
- Sign in again to get a new token if expired

✅ **Use Postman/Thunder Client UI for easier testing:**
- Save requests in a collection
- Add environment variables for IDs and tokens
- Add pre-request scripts to automate token exchange

---

## Troubleshooting

**"Authorization header required"**
- Add `-H "Authorization: Bearer <token>"` to your curl command
- Make sure token is not expired

**"Invalid or expired token"**
- Firebase token expired → sign in again to get new token
- Token format wrong → should be `Bearer <token>` (space between Bearer and token)

**"Failed to create user"**
- Check MongoDB connection in .env
- Verify Firebase credentials in .env

**"Too many requests"**
- Auth endpoints limited to 20 requests per 15 minutes
- Wait 15 minutes or use different IP

**Can't exchange custom token**
- Verify Firebase API key is correct
- Check that the custom token is not expired
- Ensure you're using the correct Firebase REST API endpoint
```bash
curl -X PUT "http://localhost:3000/users/98242b2a-e2ec-44b2-98f0-a5e9ba684d87" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rB43EuB7jDh1F5tsdUyc3p3wUu03" \
  -d '{
    "bio": "Senior React developer with 5 years experience",
    "skills": ["React", "Node.js", "MongoDB"],
    "location_city": "Johannesburg",
    "location_country": "South Africa"
  }'
```

---

## Common Error Responses

| Status | Error | Meaning |
|--------|-------|---------|
| 400 | Missing required fields | Check your request body |
| 401 | Invalid credentials | Wrong email/password |
| 401 | Missing Authorization header | Add Bearer token |
| 409 | Email already exists | Use different email |
| 429 | Too many requests | Rate limited (20/15min) |
| 500 | Server error | Check server logs |

---

## Tips for Testing

✅ **Test in order:**
1. Sign up → get user ID
2. Sign in → verify credentials work
3. Get user details → test protected endpoint
4. Update user → test PUT request
5. Delete user → test soft delete

✅ **Keep track of:**
- User ID (for protected endpoints)
- Email & password (for sign in)
- Firebase ID token (for all protected requests)

✅ **Use Postman/Thunder Client UI for easier testing:**
- Save requests in a collection
- Add environment variables for IDs and tokens
- Pre-request scripts to exchange customToken for idToken

---

## Troubleshooting

**"Authorization header required"**
- Add `-H "Authorization: Bearer <token>"` to your curl command

**"Invalid or expired token"**
- Firebase token expired → sign in again
- Token format wrong → should be `Bearer <token>` (space between Bearer and token)

**"Failed to create user"**
- Check MongoDB connection in .env
- Verify Firebase credentials in .env

**Rate limit exceeded**
- Wait 15 minutes or use different IP
- Auth endpoints limited to 20 requests per 15 minutes
