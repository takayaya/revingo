export const N = 8;
export const EMPTY = 0;
export const B = 1; // player (human)
export const W = 2; // CPU
export const dirs8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function createState() {
  return {
    board: Array.from({ length: N }, () => Array(N).fill(EMPTY)),
    turn: B,
    scoreB: 0,
    scoreW: 0,
    itemB: 1,
    itemW: 1,
    reverseB: 0,
    reverseW: 0,
    mode: 'cpu',
    difficulty: 'normal',
    theme: 'neon',
    legal: new Set(),
    lastMove: null,
    anims: [],
    shake: 0,
    busy: false,
    gameOver: false,
    winner: null,
    flash: 0,
    flashHue: 200,
    awaitingChoice: false,
    toastTimer: null,
    reach: { defs: [], empties: [] },
    reverseMode: false,
    bingoGaugeB: 0,
    bingoGaugeW: 0,
    bingoStreakB: 0,
    bingoStreakW: 0,
    bonusTurnsB: 0,
    bonusTurnsW: 0,
  };
}

export const BONUS_PLACEMENT_FACTOR = 2;
export const BONUS_TURN_COUNT = 5;

export const opponent = (p) => (p === B ? W : B);
export const inBounds = (x, y) => x >= 0 && x < N && y >= 0 && y < N;
export const getCell = (state, x, y) => state.board[y][x];
export const setCell = (state, x, y, v) => {
  state.board[y][x] = v;
};
export const key = (x, y) => `${x},${y}`;

export function randInt(n) {
  return Math.floor(Math.random() * n);
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function countEmpty(state) {
  let n = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (getCell(state, x, y) === EMPTY) n++;
  return n;
}

export function countBy(state, player) {
  let c = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (getCell(state, x, y) === player) c++;
  return c;
}

export function countStones(state) {
  let c = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (getCell(state, x, y) !== EMPTY) c++;
  return c;
}

export function collectFlips(state, x, y, player) {
  if (!inBounds(x, y) || getCell(state, x, y) !== EMPTY) return [];
  const opp = opponent(player);
  const flips = [];

  for (const [dx, dy] of dirs8) {
    let cx = x + dx,
      cy = y + dy;
    const line = [];
    while (inBounds(cx, cy)) {
      const s = getCell(state, cx, cy);
      if (s === opp) {
        line.push([cx, cy]);
        cx += dx;
        cy += dy;
        continue;
      }
      if (s === player) {
        if (line.length) flips.push(...line);
      }
      break;
    }
  }
  return flips;
}

export function computeLegalFor(state, player) {
  const legal = new Set();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (getCell(state, x, y) !== EMPTY) continue;
      if (collectFlips(state, x, y, player).length > 0) legal.add(key(x, y));
    }
  }
  return legal;
}

export function computeLegal(state) {
  state.legal = computeLegalFor(state, state.turn);
  return state.legal;
}

// 置かれている自駒から敵駒を挟み込んだときの反転対象を取得する
export function collectFlipsFromOccupied(state, x, y, player) {
  const opp = opponent(player);
  const flips = [];

  for (const [dx, dy] of dirs8) {
    let cx = x + dx,
      cy = y + dy;
    const line = [];
    while (inBounds(cx, cy)) {
      const s = getCell(state, cx, cy);
      if (s === opp) {
        line.push([cx, cy]);
        cx += dx;
        cy += dy;
        continue;
      }
      if (s === player) {
        if (line.length) flips.push(...line);
      }
      break;
    }
  }
  return flips;
}

export function isBothNoMoves(state) {
  if (state.legal.size !== 0) return false;
  const oppLegal = computeLegalFor(state, opponent(state.turn));
  return oppLegal.size === 0;
}

export function countItems(state, player) {
  return player === B ? state.itemB : state.itemW;
}

export function countReverseItems(state, player) {
  return player === B ? state.reverseB : state.reverseW;
}

export function decItem(state, player) {
  if (player === B) state.itemB = Math.max(0, state.itemB - 1);
  else state.itemW = Math.max(0, state.itemW - 1);
}

export function decReverseItem(state, player) {
  if (player === B) state.reverseB = Math.max(0, state.reverseB - 1);
  else state.reverseW = Math.max(0, state.reverseW - 1);
}

export function addReverseItem(state, player, n, cap = 5) {
  if (n <= 0) return;
  if (player === B) state.reverseB = Math.min(cap, state.reverseB + n);
  else state.reverseW = Math.min(cap, state.reverseW + n);
}

const gaugeKey = (player) => (player === B ? 'bingoGaugeB' : 'bingoGaugeW');
const streakKey = (player) => (player === B ? 'bingoStreakB' : 'bingoStreakW');
const bonusTurnKey = (player) => (player === B ? 'bonusTurnsB' : 'bonusTurnsW');

export function isBonusActive(state, player) {
  return state[bonusTurnKey(player)] > 0;
}

export function getBonusTurns(state, player) {
  return state[bonusTurnKey(player)];
}

export function addBingoProgress(state, player, count = 1) {
  if (count <= 0) return;
  const gKey = gaugeKey(player);
  const sKey = streakKey(player);
  const bKey = bonusTurnKey(player);
  if (state[bKey] > 0) {
    state[gKey] = 3;
    return;
  }
  state[sKey] = Math.min(3, state[sKey] + count);
  state[gKey] = Math.min(3, state[gKey] + count);
  if (state[gKey] >= 3) {
    state[gKey] = 3;
    state[bKey] = BONUS_TURN_COUNT;
    state[sKey] = 0;
  }
}

export function resetBingoProgress(state, player) {
  const gKey = gaugeKey(player);
  const sKey = streakKey(player);
  const bKey = bonusTurnKey(player);
  if (state[bKey] > 0) return;
  state[gKey] = 0;
  state[sKey] = 0;
}

export function consumeBonusTurn(state, player) {
  const bKey = bonusTurnKey(player);
  if (state[bKey] > 0) {
    state[bKey] = Math.max(0, state[bKey] - 1);
    if (state[bKey] === 0) {
      state[gaugeKey(player)] = 0;
      state[streakKey(player)] = 0;
    }
  }
}

export function applyBonusPlacementScore(state, player) {
  if (!isBonusActive(state, player)) return { gain: 0, cells: [] };

  const cells = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (getCell(state, x, y) === player) cells.push([x, y]);
    }
  }

  const gain = Math.floor(cells.length * BONUS_PLACEMENT_FACTOR);
  if (gain > 0) addScore(state, player, gain);
  return { gain, cells };
}

export function updateTurnAndPassIfNeeded(state) {
  const empties = countEmpty(state);
  if (state.legal.size !== 0) return;
  if (empties > 0) {
    state.turn = opponent(state.turn);
    computeLegal(state);
    recomputeReach(state);
  }
}

export function computeReachFor(state, player) {
  const enemy = opponent(player);
  const defs = [];
  const empties = [];
  const defSet = new Set();
  const emptySet = new Set();
  const legal = computeLegalFor(state, player);

  const addReach = (def, empty) => {
    if (!legal.has(key(empty.x, empty.y))) return;
    const dk = `${def.kind}:${def.idx}`;
    if (!defSet.has(dk)) {
      defs.push(def);
      defSet.add(dk);
    }
    const ek = key(empty.x, empty.y);
    if (!emptySet.has(ek)) {
      empties.push(empty);
      emptySet.add(ek);
    }
  };

  for (let y = 0; y < N; y++) {
    let pc = 0,
      ec = 0,
      bad = false;
    let ex = -1;
    for (let x = 0; x < N; x++) {
      const s = getCell(state, x, y);
      if (s === enemy) {
        bad = true;
        break;
      }
      if (s === player) pc++;
      else if (s === EMPTY) {
        ec++;
        ex = x;
      }
    }
    if (!bad && pc === N - 1 && ec === 1) {
      addReach({ kind: 'row', idx: y }, { x: ex, y, kind: 'row', idx: y });
    }
  }

  for (let x = 0; x < N; x++) {
    let pc = 0,
      ec = 0,
      bad = false;
    let ey = -1;
    for (let y = 0; y < N; y++) {
      const s = getCell(state, x, y);
      if (s === enemy) {
        bad = true;
        break;
      }
      if (s === player) pc++;
      else if (s === EMPTY) {
        ec++;
        ey = y;
      }
    }
    if (!bad && pc === N - 1 && ec === 1) {
      addReach({ kind: 'col', idx: x }, { x, y: ey, kind: 'col', idx: x });
    }
  }

  {
    let pc = 0,
      ec = 0,
      bad = false;
    let ei = -1;
    for (let i = 0; i < N; i++) {
      const s = getCell(state, i, i);
      if (s === enemy) {
        bad = true;
        break;
      }
      if (s === player) pc++;
      else if (s === EMPTY) {
        ec++;
        ei = i;
      }
    }
    if (!bad && pc === N - 1 && ec === 1) {
      addReach({ kind: 'diag', idx: 0 }, { x: ei, y: ei, kind: 'diag', idx: 0 });
    }
  }

  {
    let pc = 0,
      ec = 0,
      bad = false;
    let ei = -1;
    for (let i = 0; i < N; i++) {
      const x = N - 1 - i,
        y = i;
      const s = getCell(state, x, y);
      if (s === enemy) {
        bad = true;
        break;
      }
      if (s === player) pc++;
      else if (s === EMPTY) {
        ec++;
        ei = i;
      }
    }
    if (!bad && pc === N - 1 && ec === 1) {
      addReach({ kind: 'diag', idx: 1 }, { x: N - 1 - ei, y: ei, kind: 'diag', idx: 1 });
    }
  }

  const lineFullAfterMove = (cells, moveSet) => {
    for (const [x, y] of cells) {
      const k = key(x, y);
      const s = getCell(state, x, y);
      if (s === player || moveSet.has(k)) continue;
      return false;
    }
    return true;
  };

  for (const kk of legal) {
    const [mx, my] = kk.split(',').map(Number);
    const flips = collectFlips(state, mx, my, player);
    const moveSet = new Set([kk]);
    for (const [fx, fy] of flips) moveSet.add(key(fx, fy));

    const checks = [
      { kind: 'row', idx: my, cells: Array.from({ length: N }, (_, i) => [i, my]) },
      { kind: 'col', idx: mx, cells: Array.from({ length: N }, (_, i) => [mx, i]) },
    ];
    if (mx === my) checks.push({ kind: 'diag', idx: 0, cells: Array.from({ length: N }, (_, i) => [i, i]) });
    if (mx === N - 1 - my)
      checks.push({ kind: 'diag', idx: 1, cells: Array.from({ length: N }, (_, i) => [N - 1 - i, i]) });

    for (const c of checks) {
      if (lineFullAfterMove(c.cells, moveSet)) {
        addReach({ kind: c.kind, idx: c.idx }, { x: mx, y: my, kind: c.kind, idx: c.idx });
      }
    }
  }

  return { defs, empties };
}

export function recomputeReach(state) {
  if (state.gameOver) {
    state.reach = { defs: [], empties: [] };
    return state.reach;
  }
  state.reach = computeReachFor(state, state.turn);
  return state.reach;
}

export function findDeletions(state) {
  const cells = new Set();
  const defs = [];
  let lines = 0;

  for (let y = 0; y < N; y++) {
    const s = getCell(state, 0, y);
    if (s === EMPTY) continue;
    let ok = true;
    for (let x = 1; x < N; x++) if (getCell(state, x, y) !== s) { ok = false; break; }
    if (ok) {
      lines++;
      defs.push({ kind: 'row', idx: y });
      for (let x = 0; x < N; x++) cells.add(key(x, y));
    }
  }

  for (let x = 0; x < N; x++) {
    const s = getCell(state, x, 0);
    if (s === EMPTY) continue;
    let ok = true;
    for (let y = 1; y < N; y++) if (getCell(state, x, y) !== s) { ok = false; break; }
    if (ok) {
      lines++;
      defs.push({ kind: 'col', idx: x });
      for (let y = 0; y < N; y++) cells.add(key(x, y));
    }
  }

  {
    const s = getCell(state, 0, 0);
    if (s !== EMPTY) {
      let ok = true;
      for (let i = 1; i < N; i++) if (getCell(state, i, i) !== s) { ok = false; break; }
      if (ok) {
        lines++;
        defs.push({ kind: 'diag', idx: 0 });
        for (let i = 0; i < N; i++) cells.add(key(i, i));
      }
    }
  }

  {
    const s = getCell(state, N - 1, 0);
    if (s !== EMPTY) {
      let ok = true;
      for (let i = 1; i < N; i++) if (getCell(state, N - 1 - i, i) !== s) { ok = false; break; }
      if (ok) {
        lines++;
        defs.push({ kind: 'diag', idx: 1 });
        for (let i = 0; i < N; i++) cells.add(key(N - 1 - i, i));
      }
    }
  }

  return { cells, lines, defs };
}

export function addScore(state, player, n) {
  if (n <= 0) return;
  if (player === B) state.scoreB += n;
  else state.scoreW += n;
}

export function comboGain(cellCount, lines) {
  const mul = 1 + 0.5 * Math.max(0, lines - 1);
  return Math.max(0, Math.round(cellCount * mul));
}

export function clearBoard(state) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) setCell(state, x, y, EMPTY);
}

export function resetBoardKeepScoreAndItems(state) {
  clearBoard(state);
  setCell(state, 3, 3, W);
  setCell(state, 4, 4, W);
  setCell(state, 4, 3, B);
  setCell(state, 3, 4, B);

  state.turn = B;
  state.lastMove = null;
  state.anims.length = 0;
  state.shake = 0;
  state.busy = false;
  state.gameOver = false;
  state.winner = null;
  state.awaitingChoice = false;

  computeLegal(state);
  updateTurnAndPassIfNeeded(state);
  recomputeReach(state);
}

export function resetGame(state) {
  state.scoreB = 0;
  state.scoreW = 0;
  state.itemB = 1;
  state.itemW = 1;
  state.reverseB = 0;
  state.reverseW = 0;
  state.bingoGaugeB = 0;
  state.bingoGaugeW = 0;
  state.bingoStreakB = 0;
  state.bingoStreakW = 0;
  state.bonusTurnsB = 0;
  state.bonusTurnsW = 0;
  resetBoardKeepScoreAndItems(state);
}

// 稲妻用：空きマスを優先し、足りなければ敵駒を対象にする
export function ensureEnemiesForLightning(state, player, desiredCount) {
  const enemy = opponent(player);
  const emptyCells = [];
  const enemyCells = [];

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const cell = getCell(state, x, y);
      if (cell === EMPTY) emptyCells.push([x, y]);
      else if (cell === enemy) enemyCells.push([x, y]);
    }
  }

  if (enemyCells.length === 0 && emptyCells.length === 0) return [];

  shuffle(emptyCells);
  shuffle(enemyCells);

  const targets = [];

  while (targets.length < desiredCount && emptyCells.length > 0) {
    targets.push(emptyCells.pop());
  }

  while (targets.length < desiredCount && enemyCells.length > 0) {
    targets.push(enemyCells.pop());
  }

  return targets;
}

export function applyLightningPlacements(state, player, targets) {
  if (!targets || targets.length === 0) return { flipped: 0 };

  for (const [x, y] of targets) setCell(state, x, y, player);

  const flipSet = new Set();
  for (const [x, y] of targets) {
    const flips = collectFlipsFromOccupied(state, x, y, player);
    for (const [fx, fy] of flips) flipSet.add(key(fx, fy));
  }

  for (const k of flipSet) {
    const [fx, fy] = k.split(',').map(Number);
    setCell(state, fx, fy, player);
  }

  return { flipped: flipSet.size };
}
