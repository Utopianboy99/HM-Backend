# HussleMatch API - Copy & Paste Curl Commands

## 1. Health Check (No Auth Required)
```bash
curl -X GET "http://localhost:3000/health"
```
✅ **STATUS**: Working

---

## 2. Sign In & Get Custom Token
```bash
curl -X POST "http://localhost:3000/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cebo@nomail.com",
    "password": "Zecurepassword12345678!"
  }'
```
✅ **STATUS**: Working
- Copy the `customToken` value from the response

---

## 3. Exchange Custom Token → ID Token (Firebase REST API)

Replace `YOUR_CUSTOM_TOKEN_HERE` with the token from step 2:

```bash
curl -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyDc0PlLSb2tM_Hm6g-fXYBqG4Kx0o3aKZQ" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_CUSTOM_TOKEN_HERE",
    "returnSecureToken": true
  }'
```
- Copy the `idToken` value from the response
- Use this token in all protected endpoint calls below

---

## 4. Get All Users (Protected)

Replace `YOUR_ID_TOKEN_HERE` with the token from step 3:

```bash
curl -X GET "http://localhost:3000/users" \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE"
```

---

## 5. Get User by ID (Protected)

Replace `YOUR_ID_TOKEN_HERE` with the token from step 3:

```bash
curl -X GET "http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2" \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE"
```

---

## 6. Update User Profile (Protected)

Replace `YOUR_ID_TOKEN_HERE` with the token from step 3:

```bash
curl -X PUT "http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE" \
  -d '{
    "bio": "Experienced freelancer looking for interesting projects",
    "skills": ["React", "Node.js", "MongoDB"],
    "location_city": "Johannesburg",
    "location_country": "South Africa"
  }'
```

---

## 7. Delete User (Soft Delete - Protected)

Replace `YOUR_ID_TOKEN_HERE` with the token from step 3:

```bash
curl -X DELETE "http://localhost:3000/users/72c0b086-baaf-4170-a630-0fd26c747af2" \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE"
```

---

## User Details

For testing, use this user:
- **Email**: `cebo@nomail.com`
- **Password**: `Zecurepassword12345678!`
- **User ID**: `72c0b086-baaf-4170-a630-0fd26c747af2`
- **Firebase UID**: `7goEknwde0evin8yTV7pKwf7u6m2`

---

## Important Notes

### Token Expiration
- **Custom Token**: Valid for ~1 hour
- **ID Token**: Valid for ~1 hour
- If tokens expire, run steps 2 & 3 again

### Rate Limiting
- Auth endpoints: 20 requests per 15 minutes
- Other endpoints: No rate limit (unless added later)

### API Key
- Firebase API Key: `AIzaSyDc0PlLSb2tM_Hm6g-fXYBqG4Kx0o3aKZQ`
- Do not share this in version control
