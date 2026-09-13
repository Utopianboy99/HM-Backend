// Run locally from your backend folder:
//   node drop-username-index.js
//
// One-time fix: removes a stale unique index on `username` that no longer
// matches the User schema. Safe to delete this file after running once.

require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ No MONGODB_URI/MONGO_URI found in .env — check your db.js for the actual env var name and set it inline below if needed.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  const collection = mongoose.connection.collection('users');

  const indexes = await collection.indexes();
  console.log('\nCurrent indexes on `users` collection:');
  console.log(indexes.map((i) => `  ${i.name}: ${JSON.stringify(i.key)}${i.unique ? ' (unique)' : ''}`).join('\n'));

  const hasUsernameIndex = indexes.some((i) => i.name === 'username_1');
  if (!hasUsernameIndex) {
    console.log('\n⚠️  No index named "username_1" found — nothing to drop. Check the index list above for the actual name.');
  } else {
    await collection.dropIndex('username_1');
    console.log('\n✅ Dropped index: username_1');
  }

  await mongoose.disconnect();
  console.log('✅ Done. You can now retry signup.');
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});