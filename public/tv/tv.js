/* ── Poker Night TV Display ── */

const socket = io();

const SUIT_SYM = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' };
const RANK_NAME = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function cardHTML(card, cls = '') {
  if (!card) return `<div class="card-placeholder medium"></div>`;
  const color = (card.suit === 'h' || card.suit === 'd') ? 'red' : 'black';
  return `<div class="card ${color} ${cls}">
    <span class="card-rank">${RANK_NAME[card.rank]}</span>
    <span class="card-suit">${SUIT_SYM[card.suit]}</span>
  </div>`;
}

function cardBackHTML(cls = '') {
  return `<div class="card-back ${cls}"></div>`;
}

// ── CONNECT ──
function connectTV() {
  const code = document.getElementById('tv-code-input').value.toUpperCase().trim();
  if (code.length !== 4) return;

  socket.emit('tv-join', { code }, (res) => {
    if (res.success) {
      show('lobby-screen');
      document.getElementById('lobby-code').textContent = res.code;
      document.getElementById('lobby-url').textContent = `${location.origin}`;
    } else {
      alert(res.error);
    }
  });
}

document.getElementById('tv-code-input').addEventListener('keyup', (e) => {
  if (e.key === 'Enter') connectTV();
});

// Seat positions based on player count
function seatPositions(n) {
  if (n <= 2) return [0, 4];
  if (n <= 3) return [0, 4, 8];
  if (n <= 4) return [0, 2, 4, 6];
  if (n <= 5) return [0, 2, 4, 6, 8];
  if (n <= 6) return [0, 1, 3, 4, 5, 7];
  if (n <= 7) return [0, 1, 3, 4, 5, 7, 8];
  if (n <= 8) return [0, 1, 2, 3, 4, 5, 6, 7];
  if (n <= 9) return [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
}

// ── LOBBY ──
socket.on('lobby-state', (state) => {
  show('lobby-screen');
  document.getElementById('lobby-code').textContent = state.code;
  document.getElementById('lobby-url').textContent = location.origin;

  document.getElementById('lobby-players').innerHTML = state.players.map(p =>
    `<div class="lobby-p-card ${p.id === state.hostId ? 'host' : ''}">
      <span class="p-dot"></span>
      ${p.name}${p.id === state.hostId ? ' (Host)' : ''}
    </div>`
  ).join('');
});

// ── GAME ──
socket.on('game-state', (state) => {
  show('game-screen');

  // HUD
  document.getElementById('hud-room').textContent = state.roomCode;
  document.getElementById('hud-blinds').textContent = `${state.smallBlind}/${state.bigBlind}`;
  document.getElementById('hud-hand').textContent = `#${state.handNumber}`;

  const phaseNames = {
    'pre-flop': 'Pre-Flop',
    'flop': 'The Flop',
    'turn': 'The Turn',
    'river': 'The River',
    'showdown': 'Showdown',
  };
  document.getElementById('hud-phase').textContent = phaseNames[state.phase] || state.phase;

  // Community cards
  const cc = document.getElementById('tv-community');
  let ccHTML = '';
  for (let i = 0; i < 5; i++) {
    if (i < state.communityCards.length) {
      ccHTML += cardHTML(state.communityCards[i], 'deal-animation');
    } else {
      ccHTML += '<div class="card-placeholder medium"></div>';
    }
  }
  cc.innerHTML = ccHTML;

  // Pot
  const totalPot = state.pot + state.players.reduce((s, p) => s + p.bet, 0);
  document.getElementById('pot-value').textContent = totalPot > 0 ? `$${totalPot}` : '$0';

  // Seats
  const seatsEl = document.getElementById('seats');
  const positions = seatPositions(state.players.length);
  let seatsHTML = '';

  state.players.forEach((p, i) => {
    const pos = positions[i] ?? i;
    const cls = ['seat', `seat-${pos}`];
    if (p.isTurn) cls.push('is-turn');
    if (p.folded) cls.push('is-folded');
    if (p.allIn) cls.push('is-allin');

    let badge = '';
    if (p.isDealer) badge = '<div class="seat-badge dealer">D</div>';

    let betBubble = '';
    if (p.bet > 0) betBubble = `<div class="seat-bet-bubble">$${p.bet}</div>`;

    let status = '';
    if (p.allIn && !p.folded) status = '<div class="seat-status all-in">All In</div>';

    const winInfo = state.winners?.find(w => w.playerId === p.id);
    if (winInfo) status = `<div class="seat-status winner">+$${winInfo.amount}</div>`;

    // Cards
    let cards = '';
    if (state.phase === 'showdown' && p.holeCards && !p.folded) {
      cards = `<div class="seat-cards">${p.holeCards.map(c => cardHTML(c, 'deal-animation')).join('')}</div>`;
    } else if (!p.folded) {
      cards = `<div class="seat-cards">${cardBackHTML('small')}${cardBackHTML('small')}</div>`;
    }

    seatsHTML += `
      <div class="${cls.join(' ')}">
        <div class="seat-box">
          ${betBubble}
          ${badge}
          <div class="seat-name">${p.name}</div>
          <div class="seat-chips">$${p.chips}</div>
          ${status}
        </div>
        ${cards}
      </div>`;
  });
  seatsEl.innerHTML = seatsHTML;

  // Winner toast
  const toast = document.getElementById('winner-toast');
  const toastInner = document.getElementById('winner-toast-inner');

  if (state.handComplete && state.winners && state.winners.length > 0) {
    let html = '';
    for (const w of state.winners) {
      html += `<h2>${w.name} wins $${w.amount}</h2>`;
      if (w.hand) html += `<div class="toast-hand">${w.hand}</div>`;
    }
    if (state.showdownData) {
      html += '<div class="toast-showdown">';
      for (const sd of state.showdownData) {
        const cards = sd.holeCards.map(c => `${RANK_NAME[c.rank]}${SUIT_SYM[c.suit]}`).join(' ');
        html += `${sd.name}: ${cards} &mdash; ${sd.handName}<br>`;
      }
      html += '</div>';
    }
    html += '<div class="toast-next">Next hand starting soon...</div>';
    toastInner.innerHTML = html;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4500);
  } else {
    toast.classList.add('hidden');
  }
});

socket.on('game-over', (data) => {
  show('gameover-screen');
  document.getElementById('gameover-name').textContent = data.name;
  document.getElementById('gameover-chips').textContent = `$${data.chips}`;
});

socket.on('disconnect', () => {
  setTimeout(() => socket.connect(), 1000);
});
