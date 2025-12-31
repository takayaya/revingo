import {
  B,
  W,
  EMPTY,
  collectFlips,
  computeLegalFor,
  computeReachFor,
  countBy,
  opponent,
  findDeletions,
  setCell,
  getCell,
} from './gameLogic.js';

const CPU_PARAMS = {
  easy: {
    randomness: 1.0,
    dangerPenalty: 18,
  },
  normal: {
    randomness: 0.1,
    cornerWeight: 8,
    edgeWeight: 2,
    flipWeight: 0.9,
    reachBlockWeight: 10,
    bingoBonus: 12,
    materialWeight: 0.2,
    depth: 2, // CPU -> player
  },
  hard: {
    randomness: 0.08,
    cornerWeight: 10,
    edgeWeight: 3,
    flipWeight: 1.2,
    reachBlockWeight: 12,
    bingoBonus: 14,
    materialWeight: 0.28,
    depth: 3, // CPU -> player -> CPU
    beamWidth: 8,
    beamThreshold: 10,
    alphaBeta: true,
  },
};

const isCorner = (x, y) => (x === 0 || x === 7) && (y === 0 || y === 7);
const isEdge = (x, y) => x === 0 || x === 7 || y === 0 || y === 7;

const cloneBoard = (board) => board.map((row) => row.slice());

const createSimState = (state) => ({
  board: cloneBoard(state.board),
  turn: state.turn,
  legal: new Set(),
  reach: { defs: [], empties: [] },
});

function resolveDeletions(simState, scoringPlayer) {
  let lines = 0;
  let cells = 0;
  for (let chain = 0; chain < 8; chain++) {
    const delInfo = findDeletions(simState);
    if (!delInfo.lines) break;
    lines += delInfo.lines;
    cells += delInfo.cells.size;
    for (const k of delInfo.cells) {
      const [dx, dy] = k.split(',').map(Number);
      setCell(simState, dx, dy, EMPTY);
    }
  }
  return { lines, cells, scoringPlayer };
}

function simulateMove(state, player, x, y) {
  const simState = createSimState(state);
  const flips = collectFlips(simState, x, y, player);
  if (flips.length === 0) return null;

  setCell(simState, x, y, player);
  for (const [fx, fy] of flips) setCell(simState, fx, fy, player);

  const resolved = resolveDeletions(simState, player);
  simState.turn = opponent(player);
  return { x, y, player, flips, resolved, state: simState };
}

function countOwned(simState, player) {
  return countBy(simState, player);
}

function countOwnedCorners(simState, player) {
  const corners = [
    [0, 0],
    [0, 7],
    [7, 0],
    [7, 7],
  ];
  return corners.reduce((acc, [x, y]) => acc + (getCell(simState, x, y) === player ? 1 : 0), 0);
}

function countOwnedEdges(simState, player) {
  let c = 0;
  for (let i = 1; i < 7; i++) {
    if (getCell(simState, 0, i) === player) c++;
    if (getCell(simState, 7, i) === player) c++;
    if (getCell(simState, i, 0) === player) c++;
    if (getCell(simState, i, 7) === player) c++;
  }
  return c;
}

function staticEvaluate(simState, params) {
  const whiteCount = countOwned(simState, W);
  const blackCount = countOwned(simState, B);
  const cornerDiff = countOwnedCorners(simState, W) - countOwnedCorners(simState, B);
  const edgeDiff = countOwnedEdges(simState, W) - countOwnedEdges(simState, B);
  const reachWhite = computeReachFor(simState, W);
  const reachBlack = computeReachFor(simState, B);

  const reachDiff = reachWhite.defs.length - reachBlack.defs.length;
  const material = (whiteCount - blackCount) * params.materialWeight;

  return (
    cornerDiff * params.cornerWeight +
    edgeDiff * params.edgeWeight +
    reachDiff * params.reachBlockWeight +
    material
  );
}

function moveImmediateScore(ctx, params, preBlackReach, randomFn) {
  const cornerScore = isCorner(ctx.x, ctx.y) ? params.cornerWeight : 0;
  const edgeScore = !isCorner(ctx.x, ctx.y) && isEdge(ctx.x, ctx.y) ? params.edgeWeight : 0;
  const flipScore = ctx.flips.length * params.flipWeight;

  const reachAfter = computeReachFor(ctx.state, B);
  const reachDelta = (preBlackReach ?? 0) - reachAfter.defs.length;
  const reachScore = reachDelta * params.reachBlockWeight;

  const bingoScore =
    (ctx.resolved.lines || 0) *
    params.bingoBonus *
    (ctx.player === W ? 1 : -1);

  const jitter = (randomFn() - 0.5) * params.randomness;

  return cornerScore + edgeScore + flipScore + reachScore + bingoScore + jitter;
}

function moveOrderScore(ctx, params) {
  return (isCorner(ctx.x, ctx.y) ? 4 : 0) + (isEdge(ctx.x, ctx.y) ? 1 : 0) + ctx.flips.length * params.flipWeight;
}

function minimax(simState, depth, player, params, randomFn, alpha = -Infinity, beta = Infinity) {
  const legal = Array.from(computeLegalFor(simState, player));
  if (depth === 0 || legal.length === 0) {
    return { score: staticEvaluate(simState, params) };
  }

  const preBlackReach = computeReachFor(simState, B).defs.length;
  let moves = [];
  for (const kk of legal) {
    const [mx, my] = kk.split(',').map(Number);
    const sim = simulateMove(simState, player, mx, my);
    if (!sim) continue;
    moves.push({ ...sim, order: moveOrderScore(sim, params), preBlackReach });
  }

  moves.sort((a, b) => b.order - a.order);
  if (params.beamWidth && moves.length > params.beamThreshold) {
    moves = moves.slice(0, params.beamWidth);
  }

  if (player === W) {
    let best = { score: -Infinity, move: null };
    for (const m of moves) {
      const child = minimax(m.state, depth - 1, opponent(player), params, randomFn, alpha, beta);
      const score = child.score + moveImmediateScore(m, params, m.preBlackReach, randomFn);
      if (score > best.score) best = { score, move: { x: m.x, y: m.y } };
      alpha = Math.max(alpha, best.score);
      if (params.alphaBeta && beta <= alpha) break;
    }
    return best;
  } else {
    let best = { score: Infinity, move: null };
    for (const m of moves) {
      const child = minimax(m.state, depth - 1, opponent(player), params, randomFn, alpha, beta);
      const score = child.score - moveImmediateScore(m, params, m.preBlackReach, randomFn);
      if (score < best.score) best = { score, move: { x: m.x, y: m.y } };
      beta = Math.min(beta, best.score);
      if (params.alphaBeta && beta <= alpha) break;
    }
    return best;
  }
}

function pickEasyMove(state, params, randomFn) {
  const legal = Array.from(state.legal || []);
  const preBlackReach = computeReachFor(state, B);
  const candidates = [];

  for (const kk of legal) {
    const [mx, my] = kk.split(',').map(Number);
    const sim = simulateMove(state, W, mx, my);
    if (!sim) continue;
    const postReach = computeReachFor(sim.state, B);
    const isDanger = postReach.defs.length > preBlackReach.defs.length;
    candidates.push({ x: mx, y: my, flips: sim.flips.length, isDanger });
  }

  const safe = candidates.filter((c) => !c.isDanger);
  const pool = (safe.length > 0 ? safe : candidates).sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x
  );
  if (pool.length === 0) return null;

  const span = Math.max(1, Math.ceil(params.randomness * pool.length));
  const idx = Math.min(pool.length - 1, Math.floor(randomFn() * span));
  return { x: pool[idx].x, y: pool[idx].y };
}

export function chooseCpuMove(state, options = {}) {
  const params = CPU_PARAMS[state.difficulty] || CPU_PARAMS.normal;
  const randomFn = typeof options.random === 'function' ? options.random : Math.random;

  if (!state.legal || state.legal.size === 0) return null;

  if (state.difficulty === 'easy') {
    return pickEasyMove(state, params, randomFn);
  }

  const depth = params.depth ?? 2;
  const result = minimax(state, depth, W, params, randomFn);
  return result.move;
}

export { CPU_PARAMS };
