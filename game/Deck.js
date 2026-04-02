const { SUITS } = require('./constants');

class Deck {
  constructor() {
    this.cards = [];
    for (const suit of SUITS) {
      for (let rank = 2; rank <= 14; rank++) {
        this.cards.push({ rank, suit });
      }
    }
    this.shuffle();
  }

  shuffle() {
    // Fisher-Yates
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal() {
    return this.cards.pop();
  }

  dealMultiple(n) {
    const cards = [];
    for (let i = 0; i < n; i++) {
      cards.push(this.deal());
    }
    return cards;
  }
}

module.exports = Deck;
