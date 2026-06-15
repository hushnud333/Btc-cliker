// ==========================================================
// POST /api/tap
// Body: { initData: string, count?: number }
//
// Validates the request came from Telegram, then applies up to
// `count` taps (default 1) server-side: each tap costs 1 energy
// and grants coinsPerTap coins, based on the player's current
// tap level. Energy regen and offline progress are applied first.
//
// Returns the updated coins/energy/profile so the client can sync
// its display.
// ==========================================================

const { getDb } = require('./_lib/firebaseAdmin');
const { verifyTelegramInitData } = require('./_lib/verifyTelegram');
const { loadPlayer, getCoinsPerTap, getCoinsPerHour } = require('./_lib/gameLogic');

// Hard ceiling on taps processed per request, to prevent a single
// malicious request from claiming an absurd number of taps.
const MAX_TAPS_PER_REQUEST = 30;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { initData, count } = req.body || {};

    const verification = verifyTelegramInitData(initData);
    if (!verification.valid) {
      res.status(401).json({ error: 'Unauthorized', reason: verification.reason });
      return;
    }

    const userId = verification.user.id;
    const username = verification.user.first_name || verification.user.username || 'Player';

    const requestedTaps = Math.max(1, Math.min(MAX_TAPS_PER_REQUEST, Math.floor(count) || 1));

    const db = getDb();
    const { ref, state } = await loadPlayer(db, userId);

    state.username = username;

    // Apply as many taps as energy allows, up to requestedTaps
    const coinsPerTap = getCoinsPerTap(state);
    let tapsApplied = 0;
    while (tapsApplied < requestedTaps && state.energy > 0) {
      state.energy -= 1;
      state.coins += coinsPerTap;
      tapsApplied += 1;
    }

    await ref.set(state, { merge: true });

    res.status(200).json({
      ok: true,
      tapsApplied,
      coins: state.coins,
      energy: state.energy,
      maxEnergy: state.maxEnergy,
      coinsPerTap,
      coinsPerHour: getCoinsPerHour(state)
    });
  } catch (err) {
    console.error('tap error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
};
