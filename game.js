import { fetchPlayer } from './firebase-config.js';

/* ==========================================================
   CONFIG & CONSTANTS
========================================================== */
const STORAGE_KEY = 'coinHamsterSave_v1';

const MAX_ENERGY = 1000;
const ENERGY_REGEN_PER_SEC = 1;     // energy regenerated per second
const PASSIVE_TICK_MS = 1000;       // how often passive income is applied
const AUTOSAVE_MS = 5000;           // how often we persist to localStorage

/* ---- Rewarded Ads (Monetag) Config ---- */
// Monetag zone ID - the show_<zoneId> function is injected globally by
// the SDK script tag in index.html.
const MONETAG_ZONE_ID = '11147626';
const MAX_ADS_PER_DAY = 5;          // each boost type allows 5 watches/day
const COIN_MULTIPLIER_DURATION_SEC = 60;
const COIN_MULTIPLIER_VALUE = 2;

// Tap Power progression: each level increases coins earned per tap.
// Unlock price scales through these milestone thresholds.
const TAP_LEVELS = [
  { level: 1,  power: 1,     price: 0 },        // starting level (free)
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

// Referral reward (coins granted to inviter when a referred friend opens the app)
const REFERRAL_BONUS = 1000;

// Mining / Upgrade card definitions (base price & base income, scale per level)
const UPGRADE_DEFS = [
  {
    id: 'server',
    name: 'Server Upgrade',
    icon: '🖥️',
    basePrice: 100,
    baseIncome: 5,
    priceMultiplier: 1.5,
    maxLevel: 20
  },
  {
    id: 'marketing',
    name: 'Marketing Campaign',
    icon: '📢',
    basePrice: 250,
    baseIncome: 15,
    priceMultiplier: 1.6,
    maxLevel: 20
  },
  {
    id: 'team',
    name: 'Hire Developer',
    icon: '👨‍💻',
    basePrice: 500,
    baseIncome: 30,
    priceMultiplier: 1.7,
    maxLevel: 20
  },
  {
    id: 'energy_drink',
    name: 'Energy Drink Lab',
    icon: '🥤',
    basePrice: 800,
    baseIncome: 50,
    priceMultiplier: 1.8,
    maxLevel: 15
  },
  {
    id: 'mining_rig',
    name: 'Mining Rig',
    icon: '⚙️',
    basePrice: 1500,
    baseIncome: 90,
    priceMultiplier: 1.65,
    maxLevel: 20
  },
  {
    id: 'data_center',
    name: 'Data Center',
    icon: '🏢',
    basePrice: 3000,
    baseIncome: 150,
    priceMultiplier: 1.7,
    maxLevel: 20
  },
  {
    id: 'cold_storage',
    name: 'Cold Storage Vault',
    icon: '🧊',
    basePrice: 6000,
    baseIncome: 250,
    priceMultiplier: 1.75,
    maxLevel: 20
  },
  {
    id: 'exchange_listing',
    name: 'Exchange Listing',
    icon: '📈',
    basePrice: 12000,
    baseIncome: 450,
    priceMultiplier: 1.8,
    maxLevel: 20
  },
  {
    id: 'influencer',
    name: 'Influencer Deal',
    icon: '🌟',
    basePrice: 25000,
    baseIncome: 800,
    priceMultiplier: 1.85,
    maxLevel: 20
  },
  {
    id: 'solar_farm',
    name: 'Solar Power Farm',
    icon: '☀️',
    basePrice: 50000,
    baseIncome: 1500,
    priceMultiplier: 1.9,
    maxLevel: 20
  },
  {
    id: 'asic_factory',
    name: 'ASIC Factory',
    icon: '🏭',
    basePrice: 100000,
    baseIncome: 3000,
    priceMultiplier: 1.95,
    maxLevel: 20
  },
  {
    id: 'satellite_node',
    name: 'Satellite Node',
    icon: '🛰️',
    basePrice: 250000,
    baseIncome: 6000,
    priceMultiplier: 2.0,
    maxLevel: 20
  },
  {
    id: 'quantum_lab',
    name: 'Quantum Research Lab',
    icon: '🔬',
    basePrice: 500000,
    baseIncome: 12000,
    priceMultiplier: 2.05,
    maxLevel: 20
  },
  {
    id: 'whale_partner',
    name: 'Whale Partnership',
    icon: '🐳',
    basePrice: 1000000,
    baseIncome: 25000,
    priceMultiplier: 2.1,
    maxLevel: 20
  }
];

/* ==========================================================
   STATE
========================================================== */
let state = {
  coins: 0,
  energy: MAX_ENERGY,
  maxEnergy: MAX_ENERGY,
  level: 1,
  tapLevel: 1,        // index+1 into TAP_LEVELS, determines coins-per-tap
  username: 'Player',
  upgrades: {},      // { upgradeId: currentLevel }
  friends: [],        // list of friend names/ids
  referredBy: null,   // referrer's userId, if this player joined via a link
  ads: {
    date: null,            // YYYY-MM-DD string, used to reset daily counts
    energyAdsUsed: 0,
    multiplierAdsUsed: 0
  },
  lastSeen: Date.now() // timestamp for offline energy/income calc
};

let activeUpgradeCategory = 'tap'; // 'tap' | 'mine'

// Coin multiplier runtime state (not persisted across reload by design)
let multiplierActive = false;
let multiplierEndsAt = 0;
let multiplierIntervalId = null;

// Tap batching: taps are applied optimistically/locally for instant
// feedback, then periodically reconciled with the server which is
// the source of truth for the saved balance.
let pendingTaps = 0;
let tapSyncInFlight = false;
const TAP_SYNC_MS = 2000; // how often we flush pending taps to the server

/* ==========================================================
   DOM REFERENCES
========================================================== */
const els = {
  coinBalance: document.getElementById('coin-balance'),
  profitPerHour: document.getElementById('profit-per-hour'),
  energyFill: document.getElementById('energy-fill'),
  energyCurrent: document.getElementById('energy-current'),
  energyMax: document.getElementById('energy-max'),
  hamster: document.getElementById('hamster'),
  tapArea: document.querySelector('.tap-area'),
  upgradeList: document.getElementById('upgrade-list'),
  upgradeTabs: document.querySelectorAll('.upgrade-tab'),
  username: document.getElementById('username'),
  level: document.getElementById('level'),
  inviteBtn: document.getElementById('invite-btn'),
  friendsCount: document.getElementById('friends-count'),
  friendsUl: document.getElementById('friends-ul'),
  navBtns: document.querySelectorAll('.nav-btn'),
  screens: document.querySelectorAll('.screen'),
  boostEnergyBtn: document.getElementById('boost-energy-btn'),
  boostEnergyCount: document.getElementById('boost-energy-count'),
  boostMultiplierBtn: document.getElementById('boost-multiplier-btn'),
  boostMultiplierCount: document.getElementById('boost-multiplier-count'),
  multiplierBanner: document.getElementById('multiplier-banner'),
  multiplierTimer: document.getElementById('multiplier-timer')
};

/* ==========================================================
   USER IDENTITY
========================================================== */
function getUserId() {
  const tg = window.Telegram?.WebApp;
  return tg?.initDataUnsafe?.user?.id || 'demo_user';
}

function getInitData() {
  const tg = window.Telegram?.WebApp;
  return tg?.initData || '';
}

/**
 * Calls one of our /api/* backend endpoints, automatically attaching
 * Telegram's initData for server-side identity verification.
 * Returns the parsed JSON response, or null on network/error.
 */
async function apiCall(endpoint, extraBody = {}) {
  try {
    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: getInitData(), ...extraBody })
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn(`API ${endpoint} error:`, data);
      return { ok: false, ...data };
    }
    return data;
  } catch (err) {
    console.error(`API ${endpoint} failed:`, err);
    return null;
  }
}

/* ==========================================================
   PERSISTENCE (localStorage)
========================================================== */
function saveState() {
  state.lastSeen = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    // Also save under a per-user key so referral lookups can find it
    localStorage.setItem(`${STORAGE_KEY}_user_${getUserId()}`, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save game state:', err);
  }
}

/**
 * Loads local save data instantly (synchronous) and applies offline
 * progress. Cloud data is NOT fetched here - call syncFromCloud()
 * separately, after the UI has already rendered, for a fast first paint.
 */
function loadLocalState() {
  let localData = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) localData = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load local game state:', err);
  }

  if (localData) {
    state = { ...state, ...localData };
  }

  applyOfflineProgress();
}

function applyOfflineProgress() {
  const elapsedSec = Math.floor((Date.now() - (state.lastSeen || Date.now())) / 1000);
  if (elapsedSec > 0) {
    // Offline energy regen
    state.energy = Math.min(state.maxEnergy, state.energy + elapsedSec * ENERGY_REGEN_PER_SEC);

    // Offline passive income (capped at e.g. 12 hours to avoid absurd numbers)
    const cappedSec = Math.min(elapsedSec, 12 * 3600);
    const coinsPerSec = getCoinsPerHour() / 3600;
    state.coins += Math.floor(coinsPerSec * cappedSec);
  }
  state.lastSeen = Date.now();
}

/**
 * Fetches the Firestore backup in the background. If it's newer than
 * the local copy (e.g. player switched devices), merges it in and
 * re-renders. Safe to call after the UI is already visible.
 */
async function syncFromCloud() {
  let cloudData = null;
  try {
    cloudData = await fetchPlayer(getUserId());
  } catch (err) {
    console.error('Failed to fetch cloud game state:', err);
    return;
  }

  if (!cloudData) return;

  const localLastSeen = state.lastSeen || 0;
  if ((cloudData.lastSeen || 0) > localLastSeen) {
    console.log('Restored progress from Firestore backup (newer than local copy).');
    state = { ...state, ...cloudData };
    applyOfflineProgress();
    renderAll();
    saveState();
  }
}

/* ==========================================================
   TAP POWER HELPERS
========================================================== */
function getCurrentTapLevelDef() {
  const idx = Math.min(state.tapLevel - 1, TAP_LEVELS.length - 1);
  return TAP_LEVELS[idx];
}

function getCoinsPerTap() {
  return getCurrentTapLevelDef().power;
}

function getNextTapLevelDef() {
  if (state.tapLevel >= TAP_LEVELS.length) return null;
  return TAP_LEVELS[state.tapLevel]; // tapLevel is 1-indexed, array is 0-indexed -> next level
}

async function buyTapUpgrade() {
  const next = getNextTapLevelDef();
  if (!next) return;
  if (state.coins < next.price) return;

  // Flush any pending taps first so the server has an up-to-date
  // balance before checking affordability.
  await flushPendingTaps();

  const result = await apiCall('buy-tap-upgrade');
  if (!result || !result.ok) {
    if (result?.error) console.warn('Tap upgrade failed:', result.error);
    return;
  }

  state.coins = result.coins;
  state.tapLevel = result.tapLevel;

  saveState();
  renderBalance();
  renderUpgrades();
}

/* ==========================================================
   UPGRADE / PASSIVE INCOME HELPERS
========================================================== */
function getUpgradeLevel(id) {
  return state.upgrades[id] || 0;
}

function getUpgradePrice(def) {
  const level = getUpgradeLevel(def.id);
  return Math.floor(def.basePrice * Math.pow(def.priceMultiplier, level));
}

function getUpgradeIncomeAtLevel(def, level) {
  return def.baseIncome * level;
}

function getCoinsPerHour() {
  let total = 0;
  UPGRADE_DEFS.forEach(def => {
    const level = getUpgradeLevel(def.id);
    total += getUpgradeIncomeAtLevel(def, level);
  });
  return total;
}

async function buyUpgrade(id) {
  const def = UPGRADE_DEFS.find(u => u.id === id);
  if (!def) return;

  const level = getUpgradeLevel(id);
  if (level >= def.maxLevel) return;

  const price = getUpgradePrice(def);
  if (state.coins < price) return;

  await flushPendingTaps();

  const result = await apiCall('buy-mining-upgrade', { upgradeId: id });
  if (!result || !result.ok) {
    if (result?.error) console.warn('Mining upgrade failed:', result.error);
    return;
  }

  state.coins = result.coins;
  state.upgrades[id] = result.level;

  saveState();
  renderBalance();
  renderUpgrades();
}

/* ==========================================================
   RENDERING
========================================================== */
function renderBalance() {
  els.coinBalance.textContent = Math.floor(state.coins).toLocaleString();
  els.profitPerHour.textContent = `+${getCoinsPerHour().toLocaleString()} 🪙`;
  els.username.textContent = state.username;
  els.level.textContent = state.level;
}

function renderEnergy() {
  const pct = (state.energy / state.maxEnergy) * 100;
  els.energyFill.style.width = `${pct}%`;
  els.energyCurrent.textContent = Math.floor(state.energy);
  els.energyMax.textContent = state.maxEnergy;

  if (state.energy <= 0) {
    els.hamster.classList.add('energy-empty');
  } else {
    els.hamster.classList.remove('energy-empty');
  }
}

function renderUpgrades() {
  els.upgradeList.innerHTML = '';

  if (activeUpgradeCategory === 'tap') {
    renderTapUpgradeCard();
  } else {
    renderMiningCards();
  }
}

function renderTapUpgradeCard() {
  const current = getCurrentTapLevelDef();
  const next = getNextTapLevelDef();
  const isMaxed = !next;
  const affordable = !isMaxed && state.coins >= next.price;

  const card = document.createElement('div');
  card.className = `upgrade-card ${affordable ? 'affordable' : ''} ${isMaxed ? 'maxed' : ''}`;

  card.innerHTML = `
    <div class="upgrade-left">
      <div class="upgrade-icon">👆</div>
      <div class="upgrade-details">
        <span class="upgrade-name">Tap Power</span>
        <span class="upgrade-meta">
          <span class="level-badge">Lvl ${current.level}</span>
          · Currently +${current.power} coins/tap
          ${isMaxed ? '<br>· MAX LEVEL' : `<br>· Next: +${next.power} coins/tap`}
        </span>
      </div>
    </div>
    <button class="upgrade-buy-btn" id="tap-upgrade-btn" ${(!affordable || isMaxed) ? 'disabled' : ''}>
      ${isMaxed ? 'MAXED' : `<span><span class="price-icon">🪙</span> ${next.price.toLocaleString()}</span>`}
    </button>
  `;

  els.upgradeList.appendChild(card);

  if (!isMaxed) {
    document.getElementById('tap-upgrade-btn')?.addEventListener('click', buyTapUpgrade);
  }

  // Show a roadmap of all tap levels below the main card
  const roadmap = document.createElement('div');
  roadmap.className = 'tap-roadmap';
  roadmap.innerHTML = TAP_LEVELS.map(lvl => {
    const reached = state.tapLevel >= lvl.level;
    return `
      <div class="roadmap-item ${reached ? 'reached' : ''}">
        <span class="roadmap-power">+${lvl.power}/tap</span>
        <span class="roadmap-price">${lvl.price === 0 ? 'Start' : '🪙 ' + lvl.price.toLocaleString()}</span>
      </div>
    `;
  }).join('');
  els.upgradeList.appendChild(roadmap);
}

function renderMiningCards() {
  UPGRADE_DEFS.forEach(def => {
    const level = getUpgradeLevel(def.id);
    const isMaxed = level >= def.maxLevel;
    const price = getUpgradePrice(def);
    const affordable = !isMaxed && state.coins >= price;
    const incomeAtNext = getUpgradeIncomeAtLevel(def, level + 1) - getUpgradeIncomeAtLevel(def, level);

    const card = document.createElement('div');
    card.className = `upgrade-card ${affordable ? 'affordable' : ''} ${isMaxed ? 'maxed' : ''}`;

    card.innerHTML = `
      <div class="upgrade-left">
        <div class="upgrade-icon">${def.icon}</div>
        <div class="upgrade-details">
          <span class="upgrade-name">${def.name}</span>
          <span class="upgrade-meta">
            <span class="level-badge">Lvl ${level}</span>
            ${isMaxed ? '· MAX' : `· +${incomeAtNext}/hr`}
          </span>
        </div>
      </div>
      <button class="upgrade-buy-btn" data-id="${def.id}" ${(!affordable || isMaxed) ? 'disabled' : ''}>
        ${isMaxed ? 'MAXED' : `<span><span class="price-icon">🪙</span> ${price.toLocaleString()}</span>`}
      </button>
    `;

    els.upgradeList.appendChild(card);
  });

  // Attach buy listeners
  els.upgradeList.querySelectorAll('.upgrade-buy-btn').forEach(btn => {
    btn.addEventListener('click', () => buyUpgrade(btn.dataset.id));
  });
}

function renderFriends() {
  els.friendsCount.textContent = state.friends.length;

  if (state.friends.length === 0) {
    els.friendsUl.innerHTML = '<li class="empty-state">No friends invited yet.</li>';
    return;
  }

  els.friendsUl.innerHTML = state.friends
    .map(f => `<li>👤 ${f}</li>`)
    .join('');
}

function renderAll() {
  renderBalance();
  renderEnergy();
  renderUpgrades();
  renderFriends();
  renderBoosts();
}

/* ==========================================================
   TAP MECHANIC
========================================================== */
function handleTap(event) {
  if (state.energy <= 0) return;

  const coinsPerTap = getCoinsPerTap() * (multiplierActive ? COIN_MULTIPLIER_VALUE : 1);

  // Optimistic local update - instant feedback. The server is the
  // source of truth and will reconcile this shortly via flushPendingTaps().
  state.energy = Math.max(0, state.energy - 1);
  state.coins += coinsPerTap;
  pendingTaps += 1;

  renderBalance();
  renderEnergy();

  // Tap squish animation
  els.hamster.classList.remove('tapped');
  // restart animation by forcing reflow
  void els.hamster.offsetWidth;
  els.hamster.classList.add('tapped');

  // Determine click coordinates relative to tap area
  const rect = els.tapArea.getBoundingClientRect();
  let clientX, clientY;

  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else if (event.changedTouches && event.changedTouches.length > 0) {
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  const x = clientX - rect.left;
  const y = clientY - rect.top;

  spawnFloatingPoints(x, y, `+${coinsPerTap}`);

  // Telegram haptic feedback (if available)
  if (window.Telegram?.WebApp?.HapticFeedback) {
    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
  }
}

/**
 * Sends accumulated taps to the server for validation, then
 * reconciles local coins/energy with the authoritative response.
 * Called on an interval and on page unload.
 */
async function flushPendingTaps() {
  if (pendingTaps === 0 || tapSyncInFlight) return;

  const count = pendingTaps;
  pendingTaps = 0;
  tapSyncInFlight = true;

  const result = await apiCall('tap', { count });
  tapSyncInFlight = false;

  if (!result || !result.ok) {
    // Server rejected or network failed - put the taps back so we
    // retry next cycle, and avoid drifting the local balance further.
    pendingTaps += count;
    return;
  }

  // Reconcile with server's authoritative values
  state.coins = result.coins;
  state.energy = result.energy;
  renderBalance();
  renderEnergy();
}

function spawnFloatingPoints(x, y, text) {
  const el = document.createElement('div');
  el.className = 'float-points';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;

  // Small random horizontal drift for variety
  const drift = (Math.random() - 0.5) * 30;
  el.style.transform = `translate(-50%, -50%) translateX(${drift}px)`;

  els.tapArea.appendChild(el);

  // Remove after animation completes
  setTimeout(() => el.remove(), 950);
}

/* ==========================================================
   REWARDED ADS (Monetag)
========================================================== */
function todayString() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function resetDailyAdCountsIfNeeded() {
  if (!state.ads) {
    state.ads = { date: null, energyAdsUsed: 0, multiplierAdsUsed: 0 };
  }
  const today = todayString();
  if (state.ads.date !== today) {
    state.ads.date = today;
    state.ads.energyAdsUsed = 0;
    state.ads.multiplierAdsUsed = 0;
  }
}

function initAdsgram() {
  // Monetag's SDK script (in index.html) injects a global function
  // named `show_<zoneId>` once it loads - no separate init step needed.
  if (typeof window[`show_${MONETAG_ZONE_ID}`] !== 'function') {
    console.warn('Monetag SDK not loaded yet - rewarded ads may be unavailable.');
  }
}

/**
 * Shows a rewarded ad via Monetag. Returns a Promise that resolves true
 * if the user watched it fully (reward granted) or false if skipped/error.
 */
function showRewardedAd() {
  const showFn = window[`show_${MONETAG_ZONE_ID}`];
  if (typeof showFn !== 'function') {
    return Promise.resolve(false);
  }
  return showFn()
    .then(() => true)    // resolved promise -> ad watched fully, grant reward
    .catch(() => false);  // rejected -> skipped, closed early, or no ad available
}

function watchAdForEnergy() {
  resetDailyAdCountsIfNeeded();
  if (state.ads.energyAdsUsed >= MAX_ADS_PER_DAY) return;

  els.boostEnergyBtn.disabled = true;

  showRewardedAd().then(async rewarded => {
    if (!rewarded) {
      els.boostEnergyBtn.disabled = false;
      return;
    }

    const result = await apiCall('claim-ad-reward', { rewardType: 'energy' });
    els.boostEnergyBtn.disabled = false;

    if (!result || !result.ok) {
      if (result?.error) console.warn('Energy ad claim failed:', result.error);
      return;
    }

    state.energy = result.energy;
    state.ads = result.ads;

    saveState();
    renderEnergy();
    renderBoosts();
  });
}

function watchAdForMultiplier() {
  resetDailyAdCountsIfNeeded();
  if (state.ads.multiplierAdsUsed >= MAX_ADS_PER_DAY) return;

  els.boostMultiplierBtn.disabled = true;

  showRewardedAd().then(async rewarded => {
    if (!rewarded) {
      els.boostMultiplierBtn.disabled = false;
      return;
    }

    const result = await apiCall('claim-ad-reward', { rewardType: 'multiplier' });
    els.boostMultiplierBtn.disabled = false;

    if (!result || !result.ok) {
      if (result?.error) console.warn('Multiplier ad claim failed:', result.error);
      return;
    }

    state.ads = result.ads;

    saveState();
    renderBoosts();
    activateCoinMultiplier(result.multiplierEndsAt);
  });
}

function activateCoinMultiplier(endsAt) {
  multiplierActive = true;
  multiplierEndsAt = endsAt || (Date.now() + COIN_MULTIPLIER_DURATION_SEC * 1000);

  els.multiplierBanner.style.display = 'block';

  if (multiplierIntervalId) clearInterval(multiplierIntervalId);
  multiplierIntervalId = setInterval(() => {
    const remainingMs = multiplierEndsAt - Date.now();
    if (remainingMs <= 0) {
      multiplierActive = false;
      els.multiplierBanner.style.display = 'none';
      clearInterval(multiplierIntervalId);
      multiplierIntervalId = null;
      return;
    }
    els.multiplierTimer.textContent = Math.ceil(remainingMs / 1000);
  }, 1000);
}

function renderBoosts() {
  resetDailyAdCountsIfNeeded();

  const energyLeft = MAX_ADS_PER_DAY - state.ads.energyAdsUsed;
  const multiplierLeft = MAX_ADS_PER_DAY - state.ads.multiplierAdsUsed;

  els.boostEnergyCount.textContent = `Watch ad · ${energyLeft}/${MAX_ADS_PER_DAY} left today`;
  els.boostMultiplierCount.textContent = `Watch ad · ${multiplierLeft}/${MAX_ADS_PER_DAY} left today`;

  els.boostEnergyBtn.disabled = energyLeft <= 0;
  els.boostMultiplierBtn.disabled = multiplierLeft <= 0;
}

function setupBoosts() {
  els.boostEnergyBtn.addEventListener('click', watchAdForEnergy);
  els.boostMultiplierBtn.addEventListener('click', watchAdForMultiplier);
}

/* ==========================================================
   ENERGY REGEN LOOP
========================================================== */
function startEnergyRegen() {
  setInterval(() => {
    if (state.energy < state.maxEnergy) {
      state.energy = Math.min(state.maxEnergy, state.energy + ENERGY_REGEN_PER_SEC);
      renderEnergy();
    }
  }, 1000);
}

/* ==========================================================
   PASSIVE INCOME LOOP
========================================================== */
function startPassiveIncome() {
  setInterval(() => {
    const coinsPerHour = getCoinsPerHour();
    if (coinsPerHour > 0) {
      const coinsPerTick = coinsPerHour / (3600 * (1000 / PASSIVE_TICK_MS));
      state.coins += coinsPerTick;
      renderBalance();
    }
  }, PASSIVE_TICK_MS);
}

function setupUpgradeTabs() {
  els.upgradeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      activeUpgradeCategory = tab.dataset.category;
      els.upgradeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderUpgrades();
    });
  });
}

/* ==========================================================
   NAVIGATION
========================================================== */
function setupNavigation() {
  els.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.screen;

      els.navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      els.screens.forEach(screen => {
        screen.classList.toggle('active', screen.id === targetId);
      });
    });
  });
}

/* ==========================================================
   FRIENDS / INVITE
========================================================== */
function setupInvite() {
  els.inviteBtn.addEventListener('click', () => {
    const tg = window.Telegram?.WebApp;
    const botUsername = 'Btcclickercoin_bot'; // your bot's username
    const userId = tg?.initDataUnsafe?.user?.id || 'demo';
    const inviteLink = `https://t.me/${botUsername}?start=ref_${userId}`;

    if (tg && tg.openTelegramLink) {
      const shareText = encodeURIComponent('Join me on CoinHamster and earn free coins! 🪙');
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${shareText}`);
    } else {
      // Fallback for browser testing
      navigator.clipboard?.writeText(inviteLink);
      alert(`Invite link copied:\n${inviteLink}`);
    }
  });
}

/* ==========================================================
   TELEGRAM SDK INTEGRATION
========================================================== */
function initTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    // Fallback for browser testing: check URL query param ?ref=demo
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) handleReferral(ref);
    return;
  }

  tg.ready();
  tg.expand();

  const user = tg.initDataUnsafe?.user;
  if (user) {
    state.username = user.first_name || user.username || 'Player';
  }

  // start_param carries our "ref_<inviterId>" payload from the deep link
  const startParam = tg.initDataUnsafe?.start_param;
  if (startParam && startParam.startsWith('ref_')) {
    const inviterId = startParam.replace('ref_', '');
    handleReferral(inviterId);
  }
}

/**
 * Handles a new player arriving via a referral link. Calls the
 * server, which verifies this player hasn't already been referred,
 * then atomically credits the inviter with REFERRAL_BONUS coins and
 * adds this player to the inviter's friends list.
 */
function handleReferral(inviterId) {
  if (state.referredBy) return; // already processed
  if (!inviterId) return;

  const myId = getUserId();

  // Avoid self-referral
  if (String(myId) === String(inviterId)) return;

  apiCall('claim-referral', { inviterId }).then(result => {
    if (result && result.ok) {
      state.referredBy = result.referredBy;
      saveState();
      console.log(`Referral claimed: referred by ${inviterId}`);
    } else if (result?.error) {
      console.log('Referral not claimed:', result.error);
    }
  });
}

/**
 * PLACEHOLDER: Sync local state with backend server.
 * In production, this would POST the player's state (coins, energy,
 * upgrades, etc.) along with Telegram initData to your backend API
 * for verification and persistent storage.
 *
 * Example usage:
 *   syncWithBackend();
 */
async function syncWithBackend() {
  const tg = window.Telegram?.WebApp;
  const payload = {
    initData: tg?.initData || null,           // Telegram auth payload (verify server-side)
    userId: tg?.initDataUnsafe?.user?.id || null,
    coins: state.coins,
    energy: state.energy,
    upgrades: state.upgrades,
    friends: state.friends,
    timestamp: Date.now()
  };

  console.log('[Backend Sync Placeholder] Would send payload:', payload);

  // Example real implementation:
  // try {
  //   const res = await fetch('https://your-backend.com/api/sync', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(payload)
  //   });
  //   const data = await res.json();
  //   console.log('Sync successful:', data);
  // } catch (err) {
  //   console.error('Sync failed:', err);
  // }
}

/* ==========================================================
   INIT
========================================================== */
function init() {
  // 1. Load local data instantly and render right away (fast first paint)
  loadLocalState();
  initTelegram();
  renderAll();
  setupNavigation();
  setupUpgradeTabs();
  setupInvite();
  setupBoosts();
  initAdsgram();

  // Tap listeners (mouse + touch, passive for performance)
  els.hamster.addEventListener('click', handleTap);
  els.hamster.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleTap(e);
  }, { passive: false });

  startEnergyRegen();
  startPassiveIncome();

  setInterval(saveState, AUTOSAVE_MS);
  setInterval(flushPendingTaps, TAP_SYNC_MS);

  window.addEventListener('beforeunload', () => {
    saveState();
    flushPendingTaps();
  });

  // 2. Check Firestore in the background; re-render only if it has
  // newer data (e.g. progress from another device).
  syncFromCloud();

  // Example: call backend sync placeholder periodically (disabled by default)
  // setInterval(syncWithBackend, 30000);
}

document.addEventListener('DOMContentLoaded', init);
