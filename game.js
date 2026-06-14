/* ==========================================================
   CONFIG & CONSTANTS
========================================================== */
const STORAGE_KEY = 'coinHamsterSave_v1';

const MAX_ENERGY = 1000;
const ENERGY_REGEN_PER_SEC = 1;     // energy regenerated per second
const COINS_PER_TAP = 1;            // coins earned per tap
const PASSIVE_TICK_MS = 1000;       // how often passive income is applied
const AUTOSAVE_MS = 5000;           // how often we persist to localStorage

// Upgrade card definitions (base price & base income, scale per level)
const UPGRADE_DEFS = [
  {
    id: 'server',
    name: 'Server Upgrade',
    icon: '🖥️',
    basePrice: 100,
    baseIncome: 5,     // coins/hour added per level
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
  username: 'Player',
  upgrades: {},      // { upgradeId: currentLevel }
  friends: [],        // list of friend names/ids
  lastSeen: Date.now() // timestamp for offline energy/income calc
};

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
  username: document.getElementById('username'),
  level: document.getElementById('level'),
  inviteBtn: document.getElementById('invite-btn'),
  friendsCount: document.getElementById('friends-count'),
  friendsUl: document.getElementById('friends-ul'),
  navBtns: document.querySelectorAll('.nav-btn'),
  screens: document.querySelectorAll('.screen')
};

/* ==========================================================
   PERSISTENCE (localStorage)
========================================================== */
function saveState() {
  state.lastSeen = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save game state:', err);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    state = { ...state, ...saved };

    // Apply offline progress: energy regen + passive income while away
    const elapsedSec = Math.floor((Date.now() - (state.lastSeen || Date.now())) / 1000);
    if (elapsedSec > 0) {
      // Offline energy regen
      state.energy = Math.min(state.maxEnergy, state.energy + elapsedSec * ENERGY_REGEN_PER_SEC);

      // Offline passive income (capped at e.g. 12 hours to avoid absurd numbers)
      const cappedSec = Math.min(elapsedSec, 12 * 3600);
      const coinsPerSec = getCoinsPerHour() / 3600;
      state.coins += Math.floor(coinsPerSec * cappedSec);
    }
  } catch (err) {
    console.error('Failed to load game state:', err);
  }
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

function buyUpgrade(id) {
  const def = UPGRADE_DEFS.find(u => u.id === id);
  if (!def) return;

  const level = getUpgradeLevel(id);
  if (level >= def.maxLevel) return;

  const price = getUpgradePrice(def);
  if (state.coins < price) return;

  state.coins -= price;
  state.upgrades[id] = level + 1;

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
}

/* ==========================================================
   TAP MECHANIC
========================================================== */
function handleTap(event) {
  if (state.energy <= 0) return;

  // Deduct energy & add coins
  state.energy = Math.max(0, state.energy - 1);
  state.coins += COINS_PER_TAP;

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

  spawnFloatingPoints(x, y, `+${COINS_PER_TAP}`);

  // Telegram haptic feedback (if available)
  if (window.Telegram?.WebApp?.HapticFeedback) {
    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
  }
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
    const botUsername = 'YourBotUsername'; // placeholder
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
  if (!tg) return;

  tg.ready();
  tg.expand();

  // Apply Telegram theme colors if desired (optional)
  // document.body.style.background = tg.themeParams.bg_color || '';

  const user = tg.initDataUnsafe?.user;
  if (user) {
    state.username = user.first_name || user.username || 'Player';
  }
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
  loadState();
  initTelegram();
  renderAll();
  setupNavigation();
  setupInvite();

  // Tap listeners (mouse + touch, passive for performance)
  els.hamster.addEventListener('click', handleTap);
  els.hamster.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleTap(e);
  }, { passive: false });

  startEnergyRegen();
  startPassiveIncome();

  setInterval(saveState, AUTOSAVE_MS);
  window.addEventListener('beforeunload', saveState);

  // Example: call backend sync placeholder periodically (disabled by default)
  // setInterval(syncWithBackend, 30000);
}

document.addEventListener('DOMContentLoaded', init);
