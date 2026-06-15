// ==========================================================
// POST /api/buy-tap-upgrade
// Body: { initData: string }
//
// Validates the request, checks the player can afford the next
// tap-power level, deducts coins, and increments tapLevel.
// ==========================================================

const { getDb } = require('./_lib/firebaseAdmin');
const { verifyTelegramInitData } = require('./_lib/verifyTelegram');
const { loadPlayer, getNextTapLevelDef, getCoinsPerTap, getCoinsPerHour } = require('./_lib/gameLogic');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { initData } = req.body || {};

    const verification = verifyTelegramInitData(initData);
    if (!verification.valid) {
      res.status(401).json({ error: 'Unauthorized', reason: verification.reason });
      return;
    }

    const userId = verification.user.id;

    const db = getDb();
    const { ref, state } = await loadPlayer(db, userId);

    const next = getNextTapLevelDef(state);
    if (!next) {
      res.status(400).json({ error: 'Already at max tap level', coins: state.coins, tapLevel: state.tapLevel });
      return;
    }

    if (state.coins < next.price) {
      res.status(400).json({ error: 'Not enough coins', coins: state.coins, price: next.price });
      return;
    }

    state.coins -= next.price;
    state.tapLevel = next.level;

    await ref.set(state, { merge: true });

    res.status(200).json({
      ok: true,
      coins: state.coins,
      tapLevel: state.tapLevel,
      coinsPerTap: getCoinsPerTap(state),
      coinsPerHour: getCoinsPerHour(state)
    });
  } catch (err) {
    console.error('buy-tap-upgrade error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
};
