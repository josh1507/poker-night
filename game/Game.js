const Deck = require('./Deck');
const Pot = require('./Pot');
const { evaluateBest, rankPlayers, compareScores } = require('./HandEvaluator');
const { PHASES, ACTIONS, DEFAULT_SMALL_BLIND, DEFAULT_BIG_BLIND } = require('./constants');

class Game {
  constructor(players, dealerIndex, smallBlind = DEFAULT_SMALL_BLIND, bigBlind = DEFAULT_BIG_BLIND) {
    this.deck = new Deck();
    this.pot = new Pot();
    this.communityCards = [];
    this.phase = PHASES.PRE_FLOP;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;

    // Players in this hand (only those with chips)
    this.players = players.map(p => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      holeCards: [],
      bet: 0,        // bet in current round
      totalBet: 0,   // total bet this hand
      folded: false,
      allIn: false,
      hasActed: false,
    }));

    this.dealerIndex = dealerIndex % this.players.length;
    this.currentBet = 0;
    this.minRaise = bigBlind;
    this.lastRaiserIndex = -1;
    this.currentPlayerIndex = -1;
    this.roundBets = []; // collected at end of each round
    this.winners = null;
    this.handComplete = false;

    this._postBlinds();
    this._dealHoleCards();
    this._startBettingRound();
  }

  _postBlinds() {
    const n = this.players.length;
    let sbIndex, bbIndex;

    if (n === 2) {
      // Heads-up: dealer is SB, other is BB
      sbIndex = this.dealerIndex;
      bbIndex = (this.dealerIndex + 1) % n;
    } else {
      sbIndex = (this.dealerIndex + 1) % n;
      bbIndex = (this.dealerIndex + 2) % n;
    }

    this.sbIndex = sbIndex;
    this.bbIndex = bbIndex;

    // Post small blind
    const sbAmount = Math.min(this.smallBlind, this.players[sbIndex].chips);
    this.players[sbIndex].chips -= sbAmount;
    this.players[sbIndex].bet = sbAmount;
    this.players[sbIndex].totalBet = sbAmount;
    if (this.players[sbIndex].chips === 0) this.players[sbIndex].allIn = true;

    // Post big blind
    const bbAmount = Math.min(this.bigBlind, this.players[bbIndex].chips);
    this.players[bbIndex].chips -= bbAmount;
    this.players[bbIndex].bet = bbAmount;
    this.players[bbIndex].totalBet = bbAmount;
    if (this.players[bbIndex].chips === 0) this.players[bbIndex].allIn = true;

    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;
  }

  _dealHoleCards() {
    for (const player of this.players) {
      player.holeCards = this.deck.dealMultiple(2);
    }
  }

  _startBettingRound() {
    const n = this.players.length;

    // Reset round state
    for (const p of this.players) {
      p.hasActed = false;
    }

    if (this.phase === PHASES.PRE_FLOP) {
      // Action starts left of BB
      if (n === 2) {
        this.currentPlayerIndex = this.dealerIndex; // SB/dealer acts first pre-flop in heads-up
      } else {
        this.currentPlayerIndex = (this.bbIndex + 1) % n;
      }
      this.lastRaiserIndex = this.bbIndex; // BB is the "raiser" by default
    } else {
      // Post-flop: start left of dealer
      this.currentBet = 0;
      this.minRaise = this.bigBlind;
      for (const p of this.players) {
        p.bet = 0;
      }
      if (n === 2) {
        this.currentPlayerIndex = this.sbIndex;
      } else {
        this.currentPlayerIndex = (this.dealerIndex + 1) % n;
      }
      this.lastRaiserIndex = -1;
    }

    // Skip to first active player
    this._advanceToNextActive();

    // Check if round can proceed
    if (this._countActivePlayers() <= 1 || this._allActivePlayersAllIn()) {
      this._endBettingRound();
    }
  }

  _countActivePlayers() {
    return this.players.filter(p => !p.folded).length;
  }

  _countPlayersCanAct() {
    return this.players.filter(p => !p.folded && !p.allIn).length;
  }

  _allActivePlayersAllIn() {
    const canAct = this._countPlayersCanAct();
    return canAct <= 1 && this.players.filter(p => !p.folded && !p.allIn).every(p => p.bet >= this.currentBet);
  }

  _advanceToNextActive() {
    const n = this.players.length;
    let attempts = 0;
    while (attempts < n) {
      const p = this.players[this.currentPlayerIndex];
      if (!p.folded && !p.allIn) return;
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % n;
      attempts++;
    }
  }

  getValidActions() {
    const player = this.players[this.currentPlayerIndex];
    if (!player || player.folded || player.allIn) return [];

    const actions = [ACTIONS.FOLD];
    const toCall = this.currentBet - player.bet;

    if (toCall === 0) {
      actions.push(ACTIONS.CHECK);
    } else if (toCall > 0 && toCall < player.chips) {
      actions.push(ACTIONS.CALL);
    }

    // Can raise if has enough chips
    const minRaiseTotal = this.currentBet + this.minRaise;
    if (player.chips + player.bet > this.currentBet) {
      if (player.chips + player.bet >= minRaiseTotal) {
        actions.push(ACTIONS.RAISE);
      }
      actions.push(ACTIONS.ALL_IN);
    }

    return actions;
  }

  // Process a player action. Returns { success, error?, stateChanged }
  processAction(playerId, action, amount) {
    if (this.handComplete) return { success: false, error: 'Hand is complete' };

    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { success: false, error: 'Player not in game' };
    if (playerIndex !== this.currentPlayerIndex) return { success: false, error: 'Not your turn' };

    const player = this.players[playerIndex];
    if (player.folded || player.allIn) return { success: false, error: 'Cannot act' };

    const toCall = this.currentBet - player.bet;

    switch (action) {
      case ACTIONS.FOLD:
        player.folded = true;
        player.hasActed = true;
        break;

      case ACTIONS.CHECK:
        if (toCall > 0) return { success: false, error: 'Cannot check, must call or fold' };
        player.hasActed = true;
        break;

      case ACTIONS.CALL: {
        const callAmount = Math.min(toCall, player.chips);
        player.chips -= callAmount;
        player.bet += callAmount;
        player.totalBet += callAmount;
        if (player.chips === 0) player.allIn = true;
        player.hasActed = true;
        break;
      }

      case ACTIONS.RAISE: {
        const minRaiseTotal = this.currentBet + this.minRaise;
        const raiseTotal = amount || minRaiseTotal;

        if (raiseTotal < minRaiseTotal && raiseTotal < player.chips + player.bet) {
          return { success: false, error: `Minimum raise is ${minRaiseTotal}` };
        }

        const raiseAmount = raiseTotal - player.bet;
        if (raiseAmount > player.chips) return { success: false, error: 'Not enough chips' };

        this.minRaise = raiseTotal - this.currentBet;
        this.currentBet = raiseTotal;
        player.chips -= raiseAmount;
        player.bet += raiseAmount;
        player.totalBet += raiseAmount;
        if (player.chips === 0) player.allIn = true;
        player.hasActed = true;
        this.lastRaiserIndex = playerIndex;

        // Reset hasActed for others so they get a chance to respond
        for (let i = 0; i < this.players.length; i++) {
          if (i !== playerIndex && !this.players[i].folded && !this.players[i].allIn) {
            this.players[i].hasActed = false;
          }
        }
        break;
      }

      case ACTIONS.ALL_IN: {
        const allInAmount = player.chips;
        const newTotal = player.bet + allInAmount;

        if (newTotal > this.currentBet) {
          // This is a raise
          const raiseSize = newTotal - this.currentBet;
          if (raiseSize >= this.minRaise) {
            this.minRaise = raiseSize;
          }
          this.currentBet = newTotal;
          this.lastRaiserIndex = playerIndex;

          for (let i = 0; i < this.players.length; i++) {
            if (i !== playerIndex && !this.players[i].folded && !this.players[i].allIn) {
              this.players[i].hasActed = false;
            }
          }
        }

        player.chips = 0;
        player.bet = newTotal;
        player.totalBet += allInAmount;
        player.allIn = true;
        player.hasActed = true;
        break;
      }

      default:
        return { success: false, error: 'Invalid action' };
    }

    // Check if only one player remains
    if (this._countActivePlayers() === 1) {
      this._collectRoundBets();
      this._singleWinner();
      return { success: true };
    }

    // Advance to next player
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this._advanceToNextActive();

    // Check if betting round is over
    if (this._isBettingRoundOver()) {
      this._endBettingRound();
    }

    return { success: true };
  }

  _isBettingRoundOver() {
    const activePlayers = this.players.filter(p => !p.folded && !p.allIn);

    // If no one can act, round is over
    if (activePlayers.length === 0) return true;

    // All active (non-all-in) players have acted and matched the current bet
    return activePlayers.every(p => p.hasActed && p.bet >= this.currentBet);
  }

  _collectRoundBets() {
    const bets = this.players
      .filter(p => p.bet > 0)
      .map(p => ({ playerId: p.id, amount: p.bet, isAllIn: p.allIn }));

    this.pot.collectBets(bets);

    for (const p of this.players) {
      p.bet = 0;
    }
  }

  _endBettingRound() {
    this._collectRoundBets();

    // Check if we should fast-forward (all remaining players are all-in or only one can act)
    const shouldFastForward = this._countPlayersCanAct() <= 1 && this._countActivePlayers() > 1;

    switch (this.phase) {
      case PHASES.PRE_FLOP:
        this.phase = PHASES.FLOP;
        this.communityCards.push(...this.deck.dealMultiple(3));
        if (shouldFastForward) {
          this._fastForward();
        } else {
          this._startBettingRound();
        }
        break;
      case PHASES.FLOP:
        this.phase = PHASES.TURN;
        this.communityCards.push(this.deck.deal());
        if (shouldFastForward) {
          this._fastForward();
        } else {
          this._startBettingRound();
        }
        break;
      case PHASES.TURN:
        this.phase = PHASES.RIVER;
        this.communityCards.push(this.deck.deal());
        if (shouldFastForward) {
          this._fastForward();
        } else {
          this._startBettingRound();
        }
        break;
      case PHASES.RIVER:
        this._showdown();
        break;
    }
  }

  _fastForward() {
    // Deal remaining community cards and go to showdown
    while (this.communityCards.length < 5) {
      if (this.communityCards.length < 3) {
        this.communityCards.push(...this.deck.dealMultiple(3 - this.communityCards.length));
      } else {
        this.communityCards.push(this.deck.deal());
      }
    }
    this._showdown();
  }

  _singleWinner() {
    const winner = this.players.find(p => !p.folded);
    const winAmount = this.pot.total;
    winner.chips += winAmount;

    this.winners = [{
      playerId: winner.id,
      name: winner.name,
      amount: winAmount,
      hand: null, // no showdown
    }];

    this.phase = PHASES.SHOWDOWN;
    this.handComplete = true;
  }

  _showdown() {
    this.phase = PHASES.SHOWDOWN;

    const activePlayers = this.players.filter(p => !p.folded);
    const playerHands = activePlayers.map(p => ({
      playerId: p.id,
      holeCards: p.holeCards,
    }));

    const ranked = rankPlayers(playerHands, this.communityCards);
    const winnings = this.pot.distribute(ranked);

    this.winners = [];
    for (const [playerId, amount] of winnings) {
      const player = this.players.find(p => p.id === playerId);
      player.chips += amount;
      const evaluation = ranked.find(r => r.playerId === playerId)?.evaluation;
      this.winners.push({
        playerId,
        name: player.name,
        amount,
        hand: evaluation?.name || '',
      });
    }

    // Store showdown data
    this.showdownData = activePlayers.map(p => {
      const eval_ = ranked.find(r => r.playerId === p.id);
      return {
        playerId: p.id,
        name: p.name,
        holeCards: p.holeCards,
        handName: eval_?.evaluation?.name || '',
        won: winnings.get(p.id) || 0,
      };
    });

    this.handComplete = true;
  }

  // Get state for TV display (no hole cards unless showdown)
  getTVState() {
    return {
      phase: this.phase,
      communityCards: this.communityCards,
      pot: this.pot.total,
      pots: this.pot.toJSON().pots,
      dealerIndex: this.dealerIndex,
      currentPlayerIndex: this.handComplete ? -1 : this.currentPlayerIndex,
      currentBet: this.currentBet,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        isDealer: this.players.indexOf(p) === this.dealerIndex,
        isTurn: this.players.indexOf(p) === this.currentPlayerIndex && !this.handComplete,
        holeCards: this.phase === PHASES.SHOWDOWN && !p.folded ? p.holeCards : null,
      })),
      winners: this.winners,
      showdownData: this.showdownData || null,
      handComplete: this.handComplete,
    };
  }

  // Get state for a specific player
  getPlayerState(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return null;

    const isTurn = this.players.indexOf(player) === this.currentPlayerIndex && !this.handComplete;

    return {
      phase: this.phase,
      communityCards: this.communityCards,
      pot: this.pot.total,
      holeCards: player.holeCards,
      chips: player.chips,
      bet: player.bet,
      folded: player.folded,
      allIn: player.allIn,
      isTurn,
      validActions: isTurn ? this.getValidActions() : [],
      currentBet: this.currentBet,
      toCall: Math.min(this.currentBet - player.bet, player.chips),
      minRaise: this.currentBet + this.minRaise,
      maxRaise: player.chips + player.bet,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        isDealer: this.players.indexOf(p) === this.dealerIndex,
        isTurn: this.players.indexOf(p) === this.currentPlayerIndex && !this.handComplete,
        holeCards: this.phase === PHASES.SHOWDOWN && !p.folded ? p.holeCards : null,
      })),
      winners: this.winners,
      showdownData: this.showdownData || null,
      handComplete: this.handComplete,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
    };
  }
}

module.exports = Game;
