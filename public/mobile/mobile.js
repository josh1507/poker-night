/* ── Poker Night Mobile Client ── */

const socket = io();

const SUIT_SYM = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };
const RANK_NAME = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };

let myId = null;
let myName = null;
let isHost = false;
let state = null;
let raiseMin = 0;
let raiseMax = 0;
let lastTurnState = false;

// ── Screen management ──
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showError(msg) {
  const el = document.getElementById('join-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── Card rendering ──
function cardHTML(card, cls = '') {
  if (!card) return `<div class="card-placeholder ${cls}"></div>`;
  const color = (card.suit === 'h' || card.suit === 'd') ? 'red' : 'black';
  return `<div class="card ${color} ${cls}">
    <span class="card-rank">${RANK_NAME[card.rank]}</span>
    <span class="card-suit">${SUIT_SYM[card.suit]}</span>
  </div>`;
}

// ── JOIN ──
function createRoom() {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { showError('Please enter your name'); return; }
  myName = name;

  socket.emit('create-room', { name }, (res) => {
    if (res.success) {
      myId = res.playerId;
      isHost = true;
      show('lobby-screen');
    } else {
      showError(res.error);
    }
  });
}

function joinRoom() {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('room-code').value.trim().toUpperCase();
  if (!name) { showError('Please enter your name'); return; }
  if (!code || code.length !== 4) { showError('Enter a 4-letter room code'); return; }
  myName = name;

  socket.emit('join-room', { name, code }, (res) => {
    if (res.success) {
      myId = res.playerId;
      isHost = false;
      show('lobby-screen');
    } else {
      showError(res.error);
    }
  });
}

document.getElementById('room-code').addEventListener('keyup', (e) => {
  if (e.key === 'Enter') joinRoom();
});
document.getElementById('player-name').addEventListener('keyup', (e) => {
  if (e.key === 'Enter') document.getElementById('room-code').focus();
});

function startGame() {
  socket.emit('start-game', {}, (res) => {
    if (!res.success) showError(res.error);
  });
}

// ── LOBBY ──
socket.on('lobby-state', (data) => {
  if (!myId) return;
  show('lobby-screen');
  document.getElementById('lobby-code').textContent = data.code;

  const list = document.getElementById('lobby-players');
  list.innerHTML = data.players.map(p => {
    const classes = ['lobby-player'];
    if (p.id === myId) classes.push('is-you');
    if (p.id === data.hostId) classes.push('is-host');
    return `<div class="${classes.join(' ')}">
      <span class="dot"></span>
      ${p.name}${p.id === myId ? ' (You)' : ''}
    </div>`;
  }).join('');

  const startBtn = document.getElementById('start-btn');
  const waiting = document.getElementById('lobby-waiting');
  if (isHost) {
    startBtn.classList.remove('hidden');
    startBtn.disabled = data.players.length < 2;
    waiting.style.display = data.players.length < 2 ? 'flex' : 'none';
    if (data.players.length < 2) {
      waiting.innerHTML = '<span>Need at least 2 players</span>';
    }
  } else {
    startBtn.classList.add('hidden');
    waiting.style.display = 'flex';
  }
});

// ── GAME STATE ──
socket.on('game-state', (data) => {
  state = data;
  show('game-screen');

  // Header
  document.getElementById('game-phase').textContent = formatPhase(data.phase);
  const totalPot = data.pot + data.players.reduce((s, p) => s + p.bet, 0);
  document.getElementById('pot-amount').textContent = `$${totalPot}`;
  document.getElementById('hand-num').textContent = `#${data.handNumber}`;

  // Community cards
  const cc = document.getElementById('community-cards');
  let ccHTML = '';
  for (let i = 0; i < 5; i++) {
    if (i < data.communityCards.length) {
      ccHTML += cardHTML(data.communityCards[i], 'deal-animation');
    } else {
      ccHTML += '<div class="card-placeholder"></div>';
    }
  }
  cc.innerHTML = ccHTML;

  // Players
  const ring = document.getElementById('players-ring');
  ring.innerHTML = data.players.map(p => {
    const cls = ['p-chip'];
    if (p.isTurn) cls.push('is-turn');
    if (p.folded) cls.push('is-folded');
    if (p.id === myId) cls.push('is-me');
    if (p.allIn) cls.push('is-allin');

    let status = '';
    if (p.allIn) status = '<div class="p-status all-in">All In</div>';
    else if (p.isDealer) status = '<div class="p-status dealer">D</div>';

    const winInfo = data.winners?.find(w => w.playerId === p.id);
    if (winInfo) status = `<div class="p-status winner">+$${winInfo.amount}</div>`;

    return `<div class="${cls.join(' ')}">
      <div class="p-name">${p.name}</div>
      <div class="p-chips">$${p.chips}</div>
      ${p.bet > 0 ? `<div class="p-bet">Bet $${p.bet}</div>` : ''}
      ${status}
    </div>`;
  }).join('');

  // My cards
  const hc = document.getElementById('hole-cards');
  if (data.holeCards && data.holeCards.length === 2) {
    hc.innerHTML = data.holeCards.map(c => cardHTML(c, 'large deal-animation')).join('');
  }

  // My info
  document.getElementById('my-chips').querySelector('span').textContent = `$${data.chips}`;
  document.getElementById('my-bet').textContent = data.bet > 0 ? `Bet: $${data.bet}` : '';

  // Turn banner
  const banner = document.getElementById('turn-banner');
  if (data.isTurn && !data.handComplete) {
    banner.classList.remove('hidden');
    if (!lastTurnState && navigator.vibrate) navigator.vibrate([150, 80, 150]);
  } else {
    banner.classList.add('hidden');
  }
  lastTurnState = data.isTurn && !data.handComplete;

  // Actions
  renderActions(data);

  // Results
  handleResult(data);
});

function formatPhase(phase) {
  const names = {
    'pre-flop': 'Pre-Flop',
    'flop': 'Flop',
    'turn': 'Turn',
    'river': 'River',
    'showdown': 'Showdown',
  };
  return names[phase] || phase;
}

// ── ACTIONS ��─
function renderActions(data) {
  const grid = document.getElementById('action-grid');
  const drawer = document.getElementById('raise-drawer');
  drawer.classList.add('hidden');
  grid.style.display = 'grid';

  if (!data.isTurn || data.handComplete) {
    const msg = data.folded ? 'Folded this hand' : 'Waiting for your turn...';
    grid.innerHTML = `<button class="action-btn waiting-btn">${msg}</button>`;
    return;
  }

  const actions = data.validActions || [];
  let html = '';

  if (actions.includes('fold')) {
    html += `<button class="action-btn fold-btn" onclick="doAction('fold')">Fold</button>`;
  }
  if (actions.includes('check')) {
    html += `<button class="action-btn check-btn" onclick="doAction('check')">Check</button>`;
  }
  if (actions.includes('call')) {
    html += `<button class="action-btn call-btn" onclick="doAction('call')">Call<span class="call-amount">$${data.toCall}</span></button>`;
  }
  if (actions.includes('raise')) {
    html += `<button class="action-btn raise-btn" onclick="showRaise()">Raise</button>`;
  }
  if (actions.includes('all-in')) {
    html += `<button class="action-btn allin-btn" onclick="doAction('all-in')">All In &mdash; $${data.chips}</button>`;
  }

  grid.innerHTML = html;

  raiseMin = data.minRaise || data.currentBet + (data.bigBlind || 20);
  raiseMax = data.maxRaise || data.chips + data.bet;
}

function doAction(action, amount) {
  socket.emit('player-action', { action, amount }, (res) => {
    if (res && !res.success) showError(res.error);
  });
}

function showRaise() {
  document.getElementById('action-grid').style.display = 'none';
  const drawer = document.getElementById('raise-drawer');
  drawer.classList.remove('hidden');

  const slider = document.getElementById('raise-slider');
  slider.min = raiseMin;
  slider.max = raiseMax;
  slider.step = state.bigBlind || 20;
  slider.value = raiseMin;

  // Presets
  const pot = state.pot;
  const presets = [];
  const half = Math.max(raiseMin, Math.floor(pot * 0.5));
  const full = Math.max(raiseMin, pot);
  const dbl = Math.max(raiseMin, pot * 2);
  const triple = Math.max(raiseMin, pot * 3);

  if (half <= raiseMax) presets.push({ label: '1/2 Pot', val: half });
  if (full <= raiseMax && full > half) presets.push({ label: 'Pot', val: full });
  if (dbl <= raiseMax && dbl > full) presets.push({ label: '2x Pot', val: dbl });
  if (triple <= raiseMax && triple > dbl) presets.push({ label: '3x Pot', val: triple });

  document.getElementById('raise-presets').innerHTML = presets.map(p =>
    `<button class="preset-btn" onclick="setRaise(${p.val})">${p.label}</button>`
  ).join('');

  updateRaiseDisplay();
}

function setRaise(v) {
  document.getElementById('raise-slider').value = v;
  updateRaiseDisplay();
}

function updateRaiseDisplay() {
  document.getElementById('raise-value').textContent = `$${parseInt(document.getElementById('raise-slider').value)}`;
}

function submitRaise() {
  doAction('raise', parseInt(document.getElementById('raise-slider').value));
  cancelRaise();
}

function cancelRaise() {
  document.getElementById('raise-drawer').classList.add('hidden');
  document.getElementById('action-grid').style.display = 'grid';
  if (state) renderActions(state);
}

// ── RESULTS ──
function handleResult(data) {
  const overlay = document.getElementById('result-overlay');
  const card = document.getElementById('result-card');

  if (data.handComplete && data.winners && data.winners.length > 0) {
    const iWon = data.winners.find(w => w.playerId === myId);
    let html = '';

    if (iWon) {
      html += `<div class="result-emoji">&#127881;</div>`;
      html += `<h3>You Win!</h3>`;
      if (iWon.hand) html += `<div class="result-hand">${iWon.hand}</div>`;
      html += `<div class="result-amount">+$${iWon.amount}</div>`;
    } else {
      const w = data.winners[0];
      html += `<div class="result-emoji">&#128172;</div>`;
      html += `<h3>${w.name} Wins</h3>`;
      if (w.hand) html += `<div class="result-hand">${w.hand}</div>`;
      html += `<div class="result-amount">$${w.amount}</div>`;
    }

    card.innerHTML = html;
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 4500);
  } else {
    overlay.classList.add('hidden');
  }
}

// ── GAME OVER ──
socket.on('game-over', (data) => {
  show('gameover-screen');
  document.getElementById('go-winner').textContent = data.name;
  document.getElementById('go-chips').textContent = `$${data.chips}`;
});

// ── RECONNECT ──
socket.on('connect', () => {
  if (myName && state?.roomCode) {
    socket.emit('join-room', { name: myName, code: state.roomCode }, (res) => {
      if (res && res.success) myId = res.playerId;
    });
  }
});
