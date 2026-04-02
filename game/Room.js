const Game = require('./Game');
const { DEFAULT_STARTING_CHIPS, DEFAULT_SMALL_BLIND, DEFAULT_BIG_BLIND } = require('./constants');

class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = []; // { id, name, chips, socketId, connected }
    this.game = null;
    this.dealerIndex = 0;
    this.tvSockets = new Set();
    this.startingChips = DEFAULT_STARTING_CHIPS;
    this.smallBlind = DEFAULT_SMALL_BLIND;
    this.bigBlind = DEFAULT_BIG_BLIND;
    this.handNumber = 0;
    this.gameStarted = false;
  }

  addPlayer(id, name, socketId) {
    // Check for reconnection
    const existing = this.players.find(p => p.name === name);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      existing.id = id;
      return existing;
    }

    if (this.players.length >= 10) return null;
    if (this.gameStarted) return null;

    const player = {
      id,
      name,
      chips: this.startingChips,
      socketId,
      connected: true,
    };
    this.players.push(player);
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.find(p => p.socketId === socketId);
    if (player) {
      player.connected = false;
      // If game is active, auto-fold
      if (this.game && !this.game.handComplete) {
        const gamePlayer = this.game.players.find(p => p.id === player.id);
        if (gamePlayer && !gamePlayer.folded) {
          this.game.processAction(player.id, 'fold');
        }
      }
    }
    return player;
  }

  addTVSocket(socket) {
    this.tvSockets.add(socket);
  }

  removeTVSocket(socket) {
    this.tvSockets.delete(socket);
  }

  canStart() {
    return this.players.filter(p => p.connected).length >= 2;
  }

  startNewHand() {
    // Get players with chips who are connected
    const activePlayers = this.players.filter(p => p.chips > 0 && p.connected);
    if (activePlayers.length < 2) return false;

    this.handNumber++;

    // Advance dealer
    if (this.handNumber > 1) {
      this.dealerIndex = (this.dealerIndex + 1) % activePlayers.length;
    }

    const playerData = activePlayers.map(p => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
    }));

    this.game = new Game(playerData, this.dealerIndex, this.smallBlind, this.bigBlind);
    this.gameStarted = true;
    return true;
  }

  syncChipsBack() {
    if (!this.game) return;
    for (const gp of this.game.players) {
      const roomPlayer = this.players.find(p => p.id === gp.id);
      if (roomPlayer) {
        roomPlayer.chips = gp.chips;
      }
    }
  }

  getLobbyState() {
    return {
      code: this.code,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        connected: p.connected,
      })),
      hostId: this.hostId,
      gameStarted: this.gameStarted,
      handNumber: this.handNumber,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
    };
  }

  getPlayersOut() {
    return this.players.filter(p => p.chips <= 0);
  }

  getWinner() {
    const withChips = this.players.filter(p => p.chips > 0);
    if (withChips.length === 1) return withChips[0];
    return null;
  }
}

module.exports = Room;
