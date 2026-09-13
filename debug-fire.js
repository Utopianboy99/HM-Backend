const admin = require('./firebase/firebase.config');
try {
  const user = await admin.auth().createUser({email:'debug@test.com', password:'DebugPass123!'});
  console.log('User created:', user.uid);
} catch(e) {
  console.error('Error creating user:', e.message);
  console.error('Error code:', e.code);
}