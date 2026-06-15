// ==========================================================
// POST /api/claim-ad-reward
// Body: { initData: string, rewardType: 'energy' | 'multiplier' }
//
// Validates the request, checks the player hasn't exceeded today's
// limit for this reward type, and grants the reward:
//   - 'energy': refills energy to max
//   - 'multiplier': records a server-side expiry timestamp for a
//     coin multiplier; the /api/tap endpoint can use this in future
//     to award bonus coins (kept simple here - see comments).
//
// NOTE: This endpoint trusts that the client only calls it after a
// real ad was watched (the Monetag show() promise resolved). True
// server-side ad verification would require Monetag's server-side
// callback/postback feature pointed at another API route - not
// covered here, but recommended before relying on this for payouts.
// ==========================================================

const { getDb } = require('./_lib/firebaseAdmin');
const { verifyTelegramInitData } = require('./_lib/verifyTelegram');
const {
  loadPlayer,
  MAX_ADS_PER_DAY,
  COIN_MULTIPLIER_DURATION_SEC
} = require('./_lib/gameLogic');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { initData, rewardType } = req.body || {};

    if (!['energy', 'multiplier'].includes(rewardType)) {
      res.status(400).json({ error: 'Invalid rewardType' });
      return;
    }

    const verification = verifyTelegramInitData(initData);
    if (!verification.valid) {
      res.status(401).json({ error: 'Unauthorized', reason: verification.reason });
      return;
    }

    const userId = verification.user.id;

    const db = getDb();
    const { ref, state } = await loadPlayer(db, userId);

    if (rewardType === 'energy') {
      if (state.ads.energyAdsUsed >= MAX_ADS_PER_DAY) {
        res.status(400).json({ error: 'Daily limit reached', used: state.ads.energyAdsUsed });
        return;
      }
      state.ads.energyAdsUsed += 1;
      state.energy = state.maxEnergy;
    } else {
      if (state.ads.multiplierAdsUsed >= MAX_ADS_PER_DAY) {
        res.status(400).json({ error: 'Daily limit reached', used: state.ads.multiplierAdsUsed });
        return;
      }
      state.ads.multiplierAdsUsed += 1;
      state.multiplierEndsAt = Date.now() + COIN_MULTIPLIER_DURATION_SEC * 1000;
    }

    await ref.set(state, { merge: true });

    res.status(200).json({
      ok: true,
      rewardType,
      energy: state.energy,
      maxEnergy: state.maxEnergy,
      multiplierEndsAt: state.multiplierEndsAt || null,
      ads: state.ads
    });
  } catch (err) {
    console.error('claim-ad-reward error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
};
