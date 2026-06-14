// ==========================================================
// FIREBASE CONFIGURATION
// ==========================================================
// 1. Go to https://console.firebase.google.com
// 2. Create a project, register a Web App, and copy the config
//    object Firebase gives you into firebaseConfig below.
// 3. Enable Firestore (Build > Firestore Database > Create database).
// 4. Set Firestore security rules (see project notes / chat for
//    the recommended starter rules).
//
// ⚠️ Replace the placeholder values below with YOUR project's keys.
// ==========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  arrayUnion,
  serverTimestamp
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
 * Get a player's saved document from Firestore.
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

/**
 * Overwrite a player's full state in Firestore (merge: true so we
 * never wipe fields we didn't include).
 */
export async function savePlayer(userId, state) {
  try {
    const ref = doc(db, PLAYERS_COLLECTION, String(userId));
    await setDoc(
      ref,
      {
        ...state,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error("Firestore savePlayer failed:", err);
    return false;
  }
}

/**
 * Credit a referral bonus to the inviter's Firestore document and
 * record the new friend's name. Uses atomic increment/arrayUnion so
 * concurrent referrals don't overwrite each other.
 */
export async function creditReferral(inviterId, bonusAmount, friendName) {
  try {
    const ref = doc(db, PLAYERS_COLLECTION, String(inviterId));
    await setDoc(
      ref,
      {
        coins: increment(bonusAmount),
        friends: arrayUnion(friendName),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error("Firestore creditReferral failed:", err);
    return false;
  }
}

export { db };
