// ==========================================================
// Firebase Admin SDK initializer for Vercel serverless functions.
//
// Reads credentials from environment variables (set in Vercel
// Project Settings -> Environment Variables):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY
//
// NEVER commit the actual key values to the repo - they live only
// in Vercel's environment variable storage.
// ==========================================================

const admin = require('firebase-admin');

function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.apps[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin credentials in environment variables.');
  }

  // If the key was stored with literal \n sequences (common when pasting
  // into some env var UIs), convert them to real newlines.
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

function getDb() {
  getAdminApp();
  return admin.firestore();
}

module.exports = { admin, getAdminApp, getDb };
