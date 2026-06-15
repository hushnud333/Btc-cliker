// ==========================================================
// Shared game constants and Firestore player helpers.
// Mirrors the constants in game.js - keep these in sync!
// ==========================================================

const MAX_ENERGY = 1000;
const ENERGY_REGEN_PER_SEC = 1;

const TAP_LEVELS = [
  { level: 1,  power: 1,     price: 0 },
  { level: 2,  power: 2,     price: 1000 },
  { level: 3,  power: 5,     price: 2000 },
  { level: 4,  power: 10,    price: 5000 },
  { level: 5,  power: 25,    price: 10000 },
  { level: 6,  power: 50,    price: 25000 },
  { level: 7,  power: 100,   price: 50000 },
  { level: 8,  power: 250,   price: 100000 },
  { level: 9,  power: 500,   price: 250000 },
  { level: 10, power: 1000,  price: 1000000 }
];

const UPGRADE_DEFS = [
  { id: 'server',            name: 'Server Upgrade',       basePrice: 100,     baseIncome: 5,     priceMultiplier: 1.5,  maxLevel: 20 },
  { id: 'marketing',         name: 'Marketing Campaign',   basePrice: 250,     baseIncome: 15,    priceMultiplier: 1.6,  maxLevel: 20 },
  { id: 'team',              name: 'Hire Developer',       basePrice: 500,     baseIncome: 30,    priceMultiplier: 1.7,  maxLevel: 20 },
  { id: 'energy_drink',      name: 'Energy Drink Lab',     basePrice: 800,     baseIncome: 50,    priceMultiplier: 1.8,  maxLevel: 15 },
  { id: 'mining_rig',        name: 'Mining Rig',           basePrice: 1500,    baseIncome: 90,    priceMultiplier: 1.65, maxLevel: 20 },
  { id: 'data_center',       name: 'Data Center',          basePrice: 3000,    baseIncome: 150,   priceMultiplier: 1.7,  maxLevel: 20 },
  { id: 'cold_storage',      name: 'Cold Storage Vault',   basePrice: 6000,    baseIncome: 250,   priceMultiplier: 1.75, maxLevel: 20 },
  { id: 'exchange_listing',  name: 'Exchange Listing',     basePrice: 12000,   baseIncome: 450,   priceMultiplier: 1.8,  maxLevel: 20 },
  { id: 'influencer',        name: 'Influencer Deal',      basePrice: 25000,   baseIncome: 800,   priceMultiplier: 1.85, maxLevel: 20 },
  { id: 'solar_farm',        name: 'Solar Power Farm',     basePrice: 50000,   baseIncome: 1500,  priceMultiplier: 1.9,  maxLevel: 20 },
  { id: 'asic_factory',      name: 'ASIC Factory',         basePrice: 100000,  baseIncome: 3000,  priceMultiplier: 1.95, maxLevel: 20 },
  { id: 'satellite_node',    name: 'Satellite Node',       basePrice: 250000,  baseIncome: 6000,  priceMultiplier: 2.0,  maxLevel: 20 },
  { id: 'quantum_lab',       name: 'Quantum Research Lab', basePrice: 500000,  baseIncome: 12000, priceMultiplier: 2.05, maxLevel: 20 },
  { id: 'whale_partner',     name: 'Whale Partnership',    basePrice: 1000000, baseIncome: 25000, priceMultiplier: 2.1,  maxLevel: 20 }
];

const REFERRAL_BONUS = 1000;
const MAX_ADS_PER_DAY = 5;
const COIN_MULTIPLIER_DURATION_SEC = 60;
const COIN_MULTIPLIER_VALUE = 2;

const DEFAULT_STATE = {
  coins: 0,
  energy: MAX_ENERGY,
  maxEnergy: MAX_ENERGY,
  level: 1,
  tapLevel: 1,
  username: 'Player',
  upgrades: {},
  friends: [],
  referredBy: null,
  ads: { date: null, energyAdsUsed: 0, multiplierAdsUsed: 0 },
  lastSeen: Date.now()
};

function getCurrentTapLevelDef(state) {
  const idx = Math.min((state.tapLevel || 1) - 1, TAP_LEVELS.length - 1);
  return TAP_LEVELS[idx];
}

function getNextTapLevelDef(state) {
  if ((state.tapLevel || 1) >= TAP_LEVELS.length) return null;
  return TAP_LEVELS[state.tapLevel || 1];
}

function getCoinsPerTap(state) {
  return getCurrentTapLevelDef(state).power;
}

function getUpgradeLevel(state, id) {
  return (state.upgrades && state.upgrades[id]) || 0;
}

function getUpgradePrice(def, level) {
  return Math.floor(def.basePrice * Math.pow(def.priceMultiplier, level));
}

function getUpgradeIncomeAtLevel(def, level) {
  return def.baseIncome * level;
}

function getCoinsPerHour(state) {
  let total = 0;
  UPGRADE_DEFS.forEach(def => {
    const level = getUpgradeLevel(state, def.id);
    total += getUpgradeIncomeAtLevel(def, level);
  });
  return total;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Applies energy regen + passive income for the time elapsed since
 * state.lastSeen, mutating state in place. Also resets daily ad
 * counters if the date has changed. Updates state.lastSeen to now.
 */
function applyOfflineProgress(state) {
  const now = Date.now();
  const elapsedSec = Math.max(0, Math.floor((now - (state.lastSeen || now)) / 1000));

  if (elapsedSec > 0) {
    state.energy = Math.min(state.maxEnergy || MAX_ENERGY, (state.energy || 0) + elapsedSec * ENERGY_REGEN_PER_SEC);

    const cappedSec = Math.min(elapsedSec, 12 * 3600);
    const coinsPerSec = getCoinsPerHour(state) / 3600;
    state.coins = (state.coins || 0) + coinsPerSec * cappedSec;
  }

  if (!state.ads) {
    state.ads = { date: null, energyAdsUsed: 0, multiplierAdsUsed: 0 };
  }
  const today = todayString();
  if (state.ads.date !== today) {
    state.ads.date = today;
    state.ads.energyAdsUsed = 0;
    state.ads.multiplierAdsUsed = 0;
  }

  state.lastSeen = now;
  return state;
}

/**
 * Fetches a player's document, applying defaults for any missing
 * fields and offline progress. Does NOT write back to Firestore -
 * callers should write the final state after making their changes.
 */
async function loadPlayer(db, userId) {
  const ref = db.collection('players').doc(String(userId));
  const snap = await ref.get();

  let state;
  if (snap.exists) {
    state = { ...DEFAULT_STATE, ...snap.data() };
  } else {
    state = { ...DEFAULT_STATE, lastSeen: Date.now() };
  }

  applyOfflineProgress(state);
  return { ref, state };
}

module.exports = {
  MAX_ENERGY,
  ENERGY_REGEN_PER_SEC,
  TAP_LEVELS,
  UPGRADE_DEFS,
  REFERRAL_BONUS,
  MAX_ADS_PER_DAY,
  COIN_MULTIPLIER_DURATION_SEC,
  COIN_MULTIPLIER_VALUE,
  DEFAULT_STATE,
  getCurrentTapLevelDef,
  getNextTapLevelDef,
  getCoinsPerTap,
  getUpgradeLevel,
  getUpgradePrice,
  getUpgradeIncomeAtLevel,
  getCoinsPerHour,
  applyOfflineProgress,
  loadPlayer,
  todayString
};
