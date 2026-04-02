const { HAND_RANKS, HAND_RANK_NAMES, RANK_NAMES, SUIT_SYMBOLS } = require('./constants');

// Generate all C(n, k) combinations
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

// Evaluate a 5-card hand, returns { rank, score: [rank, ...kickers], name }
function evaluate5(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;
  // Normal straight
  if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
    isStraight = true;
    straightHigh = ranks[0];
  }
  // Ace-low straight (A-2-3-4-5)
  if (!isStraight && ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
    isStraight = true;
    straightHigh = 5; // 5-high straight
  }

  // Count rank frequencies
  const freq = {};
  for (const r of ranks) freq[r] = (freq[r] || 0) + 1;
  const groups = Object.entries(freq)
    .map(([rank, count]) => ({ rank: parseInt(rank), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // Royal flush
  if (isFlush && isStraight && straightHigh === 14) {
    return { rank: HAND_RANKS.ROYAL_FLUSH, score: [9, 14], name: 'Royal Flush' };
  }
  // Straight flush
  if (isFlush && isStraight) {
    return { rank: HAND_RANKS.STRAIGHT_FLUSH, score: [8, straightHigh], name: `Straight Flush, ${RANK_NAMES[straightHigh]}-high` };
  }
  // Four of a kind
  if (groups[0].count === 4) {
    const quad = groups[0].rank;
    const kicker = groups[1].rank;
    return { rank: HAND_RANKS.FOUR_OF_A_KIND, score: [7, quad, kicker], name: `Four of a Kind, ${RANK_NAMES[quad]}s` };
  }
  // Full house
  if (groups[0].count === 3 && groups[1].count === 2) {
    return { rank: HAND_RANKS.FULL_HOUSE, score: [6, groups[0].rank, groups[1].rank], name: `Full House, ${RANK_NAMES[groups[0].rank]}s full of ${RANK_NAMES[groups[1].rank]}s` };
  }
  // Flush
  if (isFlush) {
    return { rank: HAND_RANKS.FLUSH, score: [5, ...ranks], name: `Flush, ${RANK_NAMES[ranks[0]]}-high` };
  }
  // Straight
  if (isStraight) {
    return { rank: HAND_RANKS.STRAIGHT, score: [4, straightHigh], name: `Straight, ${RANK_NAMES[straightHigh]}-high` };
  }
  // Three of a kind
  if (groups[0].count === 3) {
    const trip = groups[0].rank;
    const kickers = groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    return { rank: HAND_RANKS.THREE_OF_A_KIND, score: [3, trip, ...kickers], name: `Three of a Kind, ${RANK_NAMES[trip]}s` };
  }
  // Two pair
  if (groups[0].count === 2 && groups[1].count === 2) {
    const highPair = Math.max(groups[0].rank, groups[1].rank);
    const lowPair = Math.min(groups[0].rank, groups[1].rank);
    const kicker = groups[2].rank;
    return { rank: HAND_RANKS.TWO_PAIR, score: [2, highPair, lowPair, kicker], name: `Two Pair, ${RANK_NAMES[highPair]}s and ${RANK_NAMES[lowPair]}s` };
  }
  // One pair
  if (groups[0].count === 2) {
    const pair = groups[0].rank;
    const kickers = groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    return { rank: HAND_RANKS.ONE_PAIR, score: [1, pair, ...kickers], name: `Pair of ${RANK_NAMES[pair]}s` };
  }
  // High card
  return { rank: HAND_RANKS.HIGH_CARD, score: [0, ...ranks], name: `High Card, ${RANK_NAMES[ranks[0]]}` };
}

// Compare two score arrays lexicographically. Returns 1 if a wins, -1 if b wins, 0 for tie
function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const va = a[i] || 0;
    const vb = b[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

// Evaluate best 5-card hand from 7 cards (2 hole + 5 community)
function evaluateBest(sevenCards) {
  const combos = combinations(sevenCards, 5);
  let best = null;
  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || compareScores(result.score, best.score) > 0) {
      best = result;
    }
  }
  return best;
}

// Rank multiple players, returns array of { playerId, evaluation } sorted best to worst
function rankPlayers(playerHands, communityCards) {
  const results = [];
  for (const { playerId, holeCards } of playerHands) {
    const allCards = [...holeCards, ...communityCards];
    const evaluation = evaluateBest(allCards);
    results.push({ playerId, evaluation });
  }
  results.sort((a, b) => compareScores(b.evaluation.score, a.evaluation.score));
  return results;
}

module.exports = { evaluate5, evaluateBest, compareScores, rankPlayers, combinations };
