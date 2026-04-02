const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Room = require('./game/Room');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// HTML page routes (must come before static middleware)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile', 'index.html'));
});
app.get('/tv', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tv', 'index.html'));
});

// Static assets (css, js, etc.)
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/mobile', express.static(path.join(__dirname, 'public', 'mobile')));
app.use('/tv', express.static(path.join(__dirname, 'public', 'tv')));

// Room storage
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function broadcastGameState(room) {
  if (!room.game) return;

  const tvState = room.game.getTVState();
  tvState.roomCode = room.code;
  tvState.handNumber = room.handNumber;

  for (const tvSocket of room.tvSockets) {
    tvSocket.emit('game-state', tvState);
  }

  for (const player of room.players) {
    if (!player.connected) continue;
    const playerState = room.game.getPlayerState(player.id);
    if (playerState) {
      playerState.roomCode = room.code;
      playerState.handNumber = room.handNumber;
      io.to(player.socketId).emit('game-state', playerState);
    }
  }
}

function broadcastLobby(room) {
  const state = room.getLobbyState();
  for (const tvSocket of room.tvSockets) {
    tvSocket.emit('lobby-state', state);
  }
  for (const player of room.players) {
    if (player.connected) {
      io.to(player.socketId).emit('lobby-state', state);
    }
  }
}

io.on('connection', (socket) => {

  socket.on('create-room', (data, callback) => {
    const code = generateRoomCode();
    const room = new Room(code, socket.id);
    rooms.set(code, room);

    const player = room.addPlayer(socket.id, data.name, socket.id);
    socket.roomCode = code;
    socket.playerId = socket.id;

    callback({ success: true, code, playerId: socket.id });
    broadcastLobby(room);
  });

  socket.on('join-room', (data, callback) => {
    const code = (data.code || '').toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }

    if (room.gameStarted) {
      // Allow reconnection by name
      const existing = room.players.find(p => p.name === data.name);
      if (existing) {
        existing.socketId = socket.id;
        existing.id = socket.id;
        existing.connected = true;
        socket.roomCode = code;
        socket.playerId = socket.id;
        callback({ success: true, code, playerId: socket.id, reconnected: true });
        broadcastLobby(room);
        if (room.game) broadcastGameState(room);
        return;
      }
      callback({ success: false, error: 'Game already started' });
      return;
    }

    const player = room.addPlayer(socket.id, data.name, socket.id);
    if (!player) {
      callback({ success: false, error: 'Room is full' });
      return;
    }

    socket.roomCode = code;
    socket.playerId = socket.id;

    callback({ success: true, code, playerId: socket.id });
    broadcastLobby(room);
  });

  socket.on('tv-join', (data, callback) => {
    const code = (data.code || '').toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }

    room.addTVSocket(socket);
    socket.roomCode = code;
    socket.isTV = true;

    callback({ success: true, code });

    if (room.game) {
      const tvState = room.game.getTVState();
      tvState.roomCode = room.code;
      tvState.handNumber = room.handNumber;
      socket.emit('game-state', tvState);
    } else {
      socket.emit('lobby-state', room.getLobbyState());
    }
  });

  socket.on('start-game', (data, callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room) { callback?.({ success: false, error: 'No room' }); return; }
    if (socket.id !== room.hostId) { callback?.({ success: false, error: 'Only host can start' }); return; }
    if (!room.canStart()) { callback?.({ success: false, error: 'Need at least 2 players' }); return; }

    const started = room.startNewHand();
    if (!started) { callback?.({ success: false, error: 'Could not start' }); return; }

    callback?.({ success: true });
    broadcastGameState(room);
  });

  socket.on('player-action', (data, callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.game) { callback?.({ success: false, error: 'No active game' }); return; }

    const result = room.game.processAction(socket.playerId, data.action, data.amount);

    if (!result.success) {
      callback?.({ success: false, error: result.error });
      return;
    }

    callback?.({ success: true });
    broadcastGameState(room);

    // If hand is complete, sync chips and prepare next hand
    if (room.game.handComplete) {
      room.syncChipsBack();

      // Check for game winner
      const gameWinner = room.getWinner();
      if (gameWinner) {
        const winnerData = { name: gameWinner.name, chips: gameWinner.chips };
        for (const tvSocket of room.tvSockets) {
          tvSocket.emit('game-over', winnerData);
        }
        for (const player of room.players) {
          if (player.connected) {
            io.to(player.socketId).emit('game-over', winnerData);
          }
        }
        return;
      }

      // Auto-start next hand after delay
      setTimeout(() => {
        if (room.game && room.game.handComplete) {
          room.startNewHand();
          broadcastGameState(room);
        }
      }, 5000);
    }
  });

  socket.on('next-hand', (data, callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    if (!room.game || !room.game.handComplete) return;

    room.startNewHand();
    broadcastGameState(room);
    callback?.({ success: true });
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;

    if (socket.isTV) {
      room.removeTVSocket(socket);
    } else {
      room.removePlayer(socket.id);
      broadcastLobby(room);
      if (room.game) broadcastGameState(room);
    }

    // Clean up empty rooms
    if (room.players.every(p => !p.connected) && room.tvSockets.size === 0) {
      rooms.delete(room.code);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  ♠ ♥ ♣ ♦  POKER NIGHT  ♦ ♣ ♥ ♠`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Server running on port ${PORT}`);
  console.log(`  TV Display: http://localhost:${PORT}/tv`);
  console.log(`  Join Game:  http://localhost:${PORT}/mobile`);
  console.log(`  ─────────────────────────────\n`);
});
