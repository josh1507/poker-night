const SUITS = ['h', 'd', 'c', 's'];

const SUIT_SYMBOLS = {
  h: '\u2665', // ♥
  d: '\u2666', // ♦
  c: '\u2663', // ♣
  s: '\u2660', // ♠
};

const SUIT_NAMES = {
  h: 'Hearts',
  d: 'Diamonds',
  c: 'Clubs',
  s: 'Spades',
};

const RANK_NAMES = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

const HAND_RANKS = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
};

const HAND_RANK_NAMES = {
  0: 'High Card',
  1: 'One Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
  9: 'Royal Flush',
};

const PHASES = {
  WAITING: 'waiting',
  PRE_FLOP: 'pre-flop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
};

const ACTIONS = {
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  RAISE: 'raise',
  ALL_IN: 'all-in',
};

const DEFAULT_SMALL_BLIND = 10;
const DEFAULT_BIG_BLIND = 20;
const DEFAULT_STARTING_CHIPS = 1000;

function cardToString(card) {
  return RANK_NAMES[card.rank] + SUIT_SYMBOLS[card.suit];
}

module.exports = {
  SUITS, SUIT_SYMBOLS, SUIT_NAMES, RANK_NAMES,
  HAND_RANKS, HAND_RANK_NAMES,
  PHASES, ACTIONS,
  DEFAULT_SMALL_BLIND, DEFAULT_BIG_BLIND, DEFAULT_STARTING_CHIPS,
  cardToString,
};
