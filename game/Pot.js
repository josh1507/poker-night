class Pot {
  constructor() {
    // Each pot: { amount, eligible: Set<playerId> }
    this.pots = [{ amount: 0, eligible: new Set() }];
  }

  get total() {
    return this.pots.reduce((sum, p) => sum + p.amount, 0);
  }

  // Collect bets from all players at end of a betting round
  // bets: [{ playerId, amount, isAllIn }]
  collectBets(bets) {
    if (bets.length === 0) return;

    // Sort by bet amount ascending
    const sorted = [...bets].sort((a, b) => a.amount - b.amount);

    let remaining = sorted.map(b => ({ ...b }));

    while (remaining.length > 0 && remaining.some(b => b.amount > 0)) {
      // Find smallest non-zero bet
      const minBet = remaining.filter(b => b.amount > 0).reduce((min, b) => Math.min(min, b.amount), Infinity);

      if (minBet === 0 || minBet === Infinity) break;

      const eligible = new Set();
      let potAmount = 0;

      for (const bet of remaining) {
        if (bet.amount > 0) {
          const contribution = Math.min(bet.amount, minBet);
          potAmount += contribution;
          bet.amount -= contribution;
          eligible.add(bet.playerId);
        }
      }

      // Also add players who were already eligible from previous rounds but not all-in
      // Merge with existing main pot if no one was all-in at the min level
      const allInAtMin = remaining.some(b => b.isAllIn && b.amount === 0 &&
        bets.find(ob => ob.playerId === b.playerId).amount <= minBet * remaining.filter(r => r.amount >= 0).length);

      // Find or create appropriate pot
      const lastPot = this.pots[this.pots.length - 1];

      // If someone went all-in for this amount, we may need a side pot
      const someoneAllInHere = remaining.some(b => b.isAllIn && b.amount === 0);

      if (someoneAllInHere && remaining.some(b => b.amount > 0)) {
        // Add to current last pot, then create new side pot for remainder
        for (const id of eligible) lastPot.eligible.add(id);
        lastPot.amount += potAmount;
        this.pots.push({ amount: 0, eligible: new Set() });
      } else {
        for (const id of eligible) lastPot.eligible.add(id);
        lastPot.amount += potAmount;
      }

      // Remove players with 0 remaining
      remaining = remaining.filter(b => b.amount > 0);
    }
  }

  // Simplified collection: just add amount to main pot for a player
  addToPot(playerId, amount) {
    const lastPot = this.pots[this.pots.length - 1];
    lastPot.amount += amount;
    lastPot.eligible.add(playerId);
  }

  // Distribute pots to winners
  // rankedResults: array of { playerId, evaluation } sorted best to worst
  // Returns: Map<playerId, amountWon>
  distribute(rankedResults) {
    const winnings = new Map();

    for (const pot of this.pots) {
      if (pot.amount === 0) continue;

      // Find the best hand among eligible players
      const eligibleResults = rankedResults.filter(r => pot.eligible.has(r.playerId));
      if (eligibleResults.length === 0) continue;

      // The best score among eligible
      const bestScore = eligibleResults[0].evaluation.score;

      // Find all players tied for best
      const winners = eligibleResults.filter(r => {
        const s = r.evaluation.score;
        for (let i = 0; i < Math.max(s.length, bestScore.length); i++) {
          if ((s[i] || 0) !== (bestScore[i] || 0)) return false;
        }
        return true;
      });

      // Split pot evenly among winners
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;

      winners.forEach((w, i) => {
        const amount = share + (i === 0 ? remainder : 0); // odd chip to first winner
        winnings.set(w.playerId, (winnings.get(w.playerId) || 0) + amount);
      });
    }

    return winnings;
  }

  toJSON() {
    return {
      pots: this.pots.map(p => ({ amount: p.amount, eligible: [...p.eligible] })),
      total: this.total,
    };
  }
}

module.exports = Pot;
