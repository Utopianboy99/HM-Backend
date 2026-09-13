require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not set. Add it to your .env file.');
}

function connectDb() {
  return mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });
}

module.exports = { connectDb, mongoose };