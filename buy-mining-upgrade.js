// ==========================================================
// POST /api/buy-mining-upgrade
// Body: { initData: string, upgradeId: string }
//
// Validates the request, checks the player can afford the next
// level of the given mining upgrade, deducts coins, and increments
// that upgrade's level.
// ==========================================================

const { getDb } = require('./_lib/firebaseAdmin');
const { verifyTelegramInitData } = require('./_lib/verifyTelegram');
const {
  loadPlayer,
  UPGRADE_DEFS,
  getUpgradeLevel,
  getUpgradePrice,
  getCoinsPerHour
} = require('./_lib/gameLogic');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { initData, upgradeId } = req.body || {};

    const verification = verifyTelegramInitData(initData);
    if (!verification.valid) {
      res.status(401).json({ error: 'Unauthorized', reason: verification.reason });
      return;
    }

    const def = UPGRADE_DEFS.find(u => u.id === upgradeId);
    if (!def) {
      res.status(400).json({ error: 'Unknown upgradeId' });
      return;
    }

    const userId = verification.user.id;

    const db = getDb();
    const { ref, state } = await loadPlayer(db, userId);

    const level = getUpgradeLevel(state, def.id);
    if (level >= def.maxLevel) {
      res.status(400).json({ error: 'Upgrade already at max level', coins: state.coins, level });
      return;
    }

    const price = getUpgradePrice(def, level);
    if (state.coins < price) {
      res.status(400).json({ error: 'Not enough coins', coins: state.coins, price });
      return;
    }

    state.coins -= price;
    state.upgrades = state.upgrades || {};
    state.upgrades[def.id] = level + 1;

    await ref.set(state, { merge: true });

    res.status(200).json({
      ok: true,
      coins: state.coins,
      upgradeId: def.id,
      level: state.upgrades[def.id],
      coinsPerHour: getCoinsPerHour(state)
    });
  } catch (err) {
    console.error('buy-mining-upgrade error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
};
