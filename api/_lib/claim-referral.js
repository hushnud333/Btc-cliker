// ==========================================================
// POST /api/claim-referral
// Body: { initData: string, inviterId: string|number }
//
// Validates the request, ensures the calling user hasn't already
// been credited as someone's referral (referredBy is empty), then
// atomically credits the inviter with REFERRAL_BONUS coins and adds
// the new user to the inviter's friends list.
// ==========================================================

const { getDb, admin } = require('./_lib/firebaseAdmin');
const { verifyTelegramInitData } = require('./_lib/verifyTelegram');
const { loadPlayer, REFERRAL_BONUS } = require('./_lib/gameLogic');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { initData, inviterId } = req.body || {};

    const verification = verifyTelegramInitData(initData);
    if (!verification.valid) {
      res.status(401).json({ error: 'Unauthorized', reason: verification.reason });
      return;
    }

    const userId = verification.user.id;
    const username = verification.user.first_name || verification.user.username || `User ${userId}`;

    if (!inviterId || String(inviterId) === String(userId)) {
      res.status(400).json({ error: 'Invalid inviterId' });
      return;
    }

    const db = getDb();
    const { ref, state } = await loadPlayer(db, userId);

    // Already processed - don't allow double-claiming
    if (state.referredBy) {
      res.status(400).json({ error: 'Referral already claimed', referredBy: state.referredBy });
      return;
    }

    // Make sure the inviter actually exists
    const inviterRef = db.collection('players').doc(String(inviterId));
    const inviterSnap = await inviterRef.get();
    if (!inviterSnap.exists) {
      res.status(400).json({ error: 'Inviter not found' });
      return;
    }

    state.referredBy = String(inviterId);
    state.username = username;

    // Write both documents - mark this user as referred, and credit
    // the inviter atomically.
    await ref.set(state, { merge: true });
    await inviterRef.set(
      {
        coins: admin.firestore.FieldValue.increment(REFERRAL_BONUS),
        friends: admin.firestore.FieldValue.arrayUnion(username)
      },
      { merge: true }
    );

    res.status(200).json({ ok: true, referredBy: state.referredBy });
  } catch (err) {
    console.error('claim-referral error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
};
