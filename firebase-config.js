// ==========================================================
// FIREBASE CONFIGURATION (client-side, read-only)
// ==========================================================
// All writes to player data now go through our backend API routes
// (/api/tap, /api/buy-tap-upgrade, etc.), which use the Firebase
// Admin SDK and bypass these client rules entirely. The client only
// reads its own player doc, used for cross-device restore.
//
// Recommended Firestore rules (Firestore -> Rules):
//
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /players/{userId} {
//         allow read: if true;
//         allow write: if false; // only the Admin SDK (backend) can write
//       }
//     }
//   }
//
// ==========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC2ncDkebh0PJ9ZMJPkV4YEmazWXQl88PA",
  authDomain: "btcclicker-7fe94.firebaseapp.com",
  projectId: "btcclicker-7fe94",
  storageBucket: "btcclicker-7fe94.firebasestorage.app",
  messagingSenderId: "666366883120",
  appId: "1:666366883120:web:3d9868a61d240402bdc4f5",
  measurementId: "G-6P8TQM3GL1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const PLAYERS_COLLECTION = "players";

/**
 * Get a player's saved document from Firestore (read-only).
 * Returns null if it doesn't exist yet.
 */
export async function fetchPlayer(userId) {
  try {
    const ref = doc(db, PLAYERS_COLLECTION, String(userId));
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("Firestore fetchPlayer failed:", err);
    return null;
  }
}

export { db };
