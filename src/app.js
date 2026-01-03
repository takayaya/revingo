import {
  B,
  W,
  EMPTY,
  N,
  createState,
  opponent,
  collectFlips,
  computeLegal,
  isBothNoMoves,
  countItems,
  decItem,
  countReverseItems,
  decReverseItem,
  addReverseItem,
  updateTurnAndPassIfNeeded,
  recomputeReach,
  findDeletions,
  addScore,
  comboGain,
  ensureEnemiesForLightning,
  key,
  setCell,
  getCell,
  shuffle,
  resetGame as resetGameState,
  inBounds,
  addBingoProgress,
  resetBingoProgress,
  isBonusActive,
  applyBonusFlipScore,
  consumeBonusTurn,
  getBonusTurns,
} from './gameLogic.js';
import { chooseCpuMove } from './cpu.js';

(() => {
  // ===== DOM =====
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  const turnPill = document.getElementById('turnPill');
  const scorePill = document.getElementById('scorePill');
  const diffPill = document.getElementById('diffPill');
  const itemPill = document.getElementById('itemPill');
  const reversePill = document.getElementById('reversePill');
  const gaugePill = document.getElementById('gaugePill');
  const titlePill = document.getElementById('titlePill');

  const modeSel = document.getElementById('modeSel');
  const diffSel = document.getElementById('diffSel');
  const themeSel = document.getElementById('themeSel');
  const lightningBtn = document.getElementById('lightningBtn');
  const resetBtn = document.getElementById('resetBtn');

  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ovTitle');
  const ovBody = document.getElementById('ovBody');
  const ovPrimary = document.getElementById('ovPrimary');
  const ovSecondary = document.getElementById('ovSecondary');

  const toastEl = document.getElementById('toast');

  const rules = document.getElementById('rules');
  const rulesBtn = document.getElementById('rulesBtn');
  const rulesClose = document.getElementById('rulesClose');
  const reverseBtn = document.getElementById('reverseBtn');

  // ===== state =====
  const state = createState();
  state.reverseMode = false;
  const get = (x, y) => getCell(state, x, y);
  const set = (x, y, v) => setCell(state, x, y, v);

  // ===== themes =====
  const THEMES = {
    neon: {
      name: 'ネオン',
      pageBg: '#060a10',
      boardBg: '#0a1320',
      boardFrame: '#0f1822',
      grid: 'rgba(170,220,255,0.16)',
      legal: 'rgba(90,255,210,0.22)',
      last: 'rgba(255,210,120,0.65)',
      flashHue: 200,
      reach: 'rgba(120,255,235,0.38)',
      reachCell: 'rgba(120,255,235,0.62)',
      bingo: 'rgba(255,255,255,0.92)',
      bingoGlow: 'rgba(120,255,235,0.75)',
      stones: {
        1: { main: '#03101d', edge: '#19e8ff', hi: 'rgba(170,255,255,0.80)', glow: 'rgba(24,230,255,0.92)', core: '#24ffff' },
        2: { main: '#fdf6ff', edge: '#ff58d9', hi: 'rgba(255,255,255,0.82)', glow: 'rgba(255,84,226,0.9)', core: '#ffd7ff' },
      },
    },
    classic: {
      name: 'クラシック',
      pageBg: '#0b0f14',
      boardBg: '#0a5c2e',
      boardFrame: '#0b2a17',
      grid: 'rgba(0,0,0,0.22)',
      legal: 'rgba(255,255,255,0.18)',
      last: 'rgba(255,210,120,0.6)',
      flashHue: 45,
      reach: 'rgba(255,235,180,0.30)',
      reachCell: 'rgba(255,235,180,0.55)',
      bingo: 'rgba(255,235,180,0.95)',
      bingoGlow: 'rgba(0,0,0,0)',
      stones: {
        1: { main: '#0b0b0b', edge: '#000000', hi: 'rgba(80,80,80,0.60)', glow: 'rgba(0,0,0,0)' },
        2: { main: '#f2f2f2', edge: '#cfcfcf', hi: 'rgba(255,255,255,0.92)', glow: 'rgba(0,0,0,0)' },
      },
    },
  };

  // ===== canvas fit =====
  function fitCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', () => {
    fitCanvas();
    syncHud();
  });

  // ===== helpers =====
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function toast(msg, ms = 1600) {
    clearTimeout(state.toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    state.toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  function showOverlay(title, body, primaryText = 'OK', onPrimary = null, secondaryText = null, onSecondary = null) {
    ovTitle.textContent = title;
    ovBody.textContent = body;
    ovPrimary.textContent = primaryText;
    ovSecondary.style.display = secondaryText ? 'inline-block' : 'none';
    if (secondaryText) ovSecondary.textContent = secondaryText;

    ovPrimary.onclick = () => {
      hideOverlay();
      onPrimary && onPrimary();
    };
    ovSecondary.onclick = () => {
      hideOverlay();
      onSecondary && onSecondary();
    };

    overlay.style.display = 'flex';
  }
  function hideOverlay() {
    overlay.style.display = 'none';
  }

  // ===== safety (avoid stuck busy) =====
  window.addEventListener('error', (e) => {
    console.error('window error', e.error || e.message);
    state.busy = false;
    state.awaitingChoice = false;
    syncHud();
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('unhandled rejection', e.reason);
    state.busy = false;
    state.awaitingChoice = false;
    syncHud();
  });

  // ===== moves =====
  function computeLegalAndReach() {
    computeLegal(state);
    recomputeReach(state);
  }

  // ===== reach =====
  function recomputeReachAndHud() {
    recomputeReach(state);
    syncHud();
  }

  function handleBonusAfterTurn(player, bingoCount) {
    const wasActive = isBonusActive(state, player);
    if (bingoCount > 0) addBingoProgress(state, player, bingoCount);
    else resetBingoProgress(state, player);
    const turns = getBonusTurns(state, player);
    const activatedNow = !wasActive && turns > 0;
    if (!activatedNow && turns > 0) {
      consumeBonusTurn(state, player);
    }
  }

  // ===== deletion rules =====
  function addFlash(amount) {
    const th = THEMES[state.theme] || THEMES.neon;
    state.flashHue = th.flashHue;
    state.flash = Math.min(1, state.flash + amount);
  }

  function boltPath(from, to, seed) {
    const pts = [];
    const steps = 10;
    const rnd = (i) => {
      const x = Math.sin(seed * 999 + i * 123.45) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const dx = to.x - from.x,
        dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len,
        ny = dx / len;
      const j = (rnd(i) - 0.5) * (0.7 * (1 - Math.abs(t - 0.5) * 1.7));
      pts.push({ x: x + nx * j, y: y + ny * j });
    }
    return pts;
  }

  function spawnLightningAnim(destroyed) {
    addFlash(0.62);
    state.shake = Math.min(22, state.shake + 10);

    const origin = { x: N / 2, y: -0.9 };
    const targets = [...destroyed].slice(0, 10);
    for (const [tx, ty] of targets) {
      const to = { x: tx + 0.5, y: ty + 0.5 };
      state.anims.push({ type: 'bolt', t: 0, pts: boltPath(origin, to, Math.random() * 9999) });

      const pCount = 18 + Math.floor(Math.random() * 14);
      for (let i = 0; i < pCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 2.2 + Math.random() * 6.4;
        state.anims.push({
          type: 'spark',
          t: 0,
          x: tx + 0.5,
          y: ty + 0.5,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 0.45 + Math.random() * 0.28,
        });
      }
    }
  }

  function bingoLabel(lines) {
    if (lines >= 3) return 'TRIPLE BINGO!';
    if (lines === 2) return 'DOUBLE BINGO!';
    return 'BINGO!';
  }

  function spawnDeleteAnim(cells, scoreValue, lines, lineDefs) {
    for (const [x, y] of cells) {
      const s = get(x, y);
      state.anims.push({ type: 'pop', x, y, t: 0, s, seed: Math.random() * 9999 });
    }

    for (const d of lineDefs || []) {
      state.anims.push({ type: 'line', t: 0, kind: d.kind, idx: d.idx });
    }

    if ((lines || 0) > 0) {
      let sx = 0,
        sy = 0;
      for (const [x, y] of cells) {
        sx += x;
        sy += y;
      }
      const cx = sx / Math.max(1, cells.length);
      const cy = sy / Math.max(1, cells.length);
      state.anims.push({ type: 'bingo', t: 0, x: cx, y: cy, lines });
    }

    if (cells.length > 0 && scoreValue > 0) {
      let sx = 0,
        sy = 0;
      for (const [x, y] of cells) {
        sx += x;
        sy += y;
      }
      const cx = sx / cells.length,
        cy = sy / cells.length;
      state.anims.push({ type: 'score', x: cx, y: cy, t: 0, value: scoreValue, lines });

      const pCount = Math.min(140, 22 + cells.length * 3 + ((lines || 1) - 1) * 14);
      for (let i = 0; i < pCount; i++) {
        const base = cells[Math.floor(Math.random() * cells.length)];
        const ang = Math.random() * Math.PI * 2;
        const sp = 1.1 + Math.random() * 4.8;
        state.anims.push({
          type: 'spark',
          t: 0,
          x: base[0] + 0.5,
          y: base[1] + 0.5,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 0.52 + Math.random() * 0.32,
        });
      }
    }

    state.shake = Math.min(16, state.shake + Math.min(10, cells.length * 0.22 + ((lines || 1) - 1) * 2.7));
    addFlash(Math.min(0.6, 0.18 + cells.length * 0.008 + ((lines || 1) - 1) * 0.1));
  }

  async function resolveAfterChange(scoringPlayer) {
    let bingoCount = 0;
    for (let chain = 0; chain < 8; chain++) {
      const delInfo = findDeletions(state);
      if (delInfo.lines === 0) break;
      bingoCount += delInfo.lines;

      const cells = [];
      for (const k of delInfo.cells) {
        const [x, y] = k.split(',').map(Number);
        cells.push([x, y]);
      }

      const gain = comboGain(cells.length, delInfo.lines);
      if (delInfo.lines > 0) {
        console.log(`[BINGO] ${delInfo.lines}ライン成立！プレイヤー${scoringPlayer}に反転アイテムを${delInfo.lines}個追加します`);
        console.log(`[BINGO] 追加前: 黒=${state.reverseB}, 白=${state.reverseW}`);
        addReverseItem(state, scoringPlayer, delInfo.lines);
        console.log(`[BINGO] 追加後: 黒=${state.reverseB}, 白=${state.reverseW}`);
      }
      spawnDeleteAnim(cells, gain, delInfo.lines, delInfo.defs);
      await sleep(130);

      for (const [x, y] of cells) set(x, y, EMPTY);
      addScore(state, scoringPlayer, gain);
      recomputeReachAndHud();
      await sleep(120);
    }
    return { bingoCount };
  }

  // ===== end / lightning choice =====
  function declareGameOver() {
    state.gameOver = true;
    let winner = 'D';
    if (state.scoreB > state.scoreW) winner = 'B';
    else if (state.scoreW > state.scoreB) winner = 'W';
    state.winner = winner;

    const winText = winner === 'D' ? '引き分け' : winner === 'B' ? 'あなた(黒)の勝ち' : 'CPU(白)の勝ち';
    showOverlay(
      'ゲームオーバー：' + winText,
      `双方とも合法手がありません。得点 黒:${state.scoreB} / 白:${state.scoreW}`,
      'もう一度',
      () => {
        resetGameUi();
      },
      '閉じる',
      () => {}
    );
  }

  function checkEndOrHandleLightningChoice() {
    if (!isBothNoMoves(state)) return false;

    const cur = state.turn;
    const opp = opponent(cur);
    const curHas = countItems(state, cur) > 0;
    const oppHas = countItems(state, opp) > 0;

    if (curHas) {
      if (state.mode === 'cpu' && cur === W) {
        toast('CPUが⚡稲妻を使った！');
        setTimeout(() => useLightning(), 120);
        return true;
      }

      state.awaitingChoice = true;
      syncHud();
      showOverlay(
        '手がありません',
        '双方とも合法手がありません。⚡稲妻を使って続行しますか？',
        '稲妻を使う',
        () => {
          state.awaitingChoice = false;
          useLightning();
        },
        'ゲームオーバー',
        () => {
          state.awaitingChoice = false;
          declareGameOver();
        }
      );
      return true;
    }

    if (oppHas) {
      state.turn = opp;
      computeLegalAndReach();
      syncHud();
      if (state.mode === 'cpu' && state.turn === W) {
        toast('CPUが⚡稲妻を使った！');
        setTimeout(() => useLightning(), 120);
        return true;
      }
      return true;
    }

    declareGameOver();
    return true;
  }

  // ===== reset =====
  function resetGameUi() {
    state.mode = modeSel.value || 'cpu';
    state.difficulty = diffSel.value || 'normal';
    state.theme = themeSel.value || 'neon';
    state.anims.length = 0;
    state.shake = 0;
    state.flash = 0;
    state.flashHue = (THEMES[state.theme] || THEMES.neon).flashHue;
    state.awaitingChoice = false;
    state.toastTimer = null;
    state.gameOver = false;
    state.reverseMode = false;

    resetGameState(state);
    recomputeReachAndHud();
  }

  // ===== lightning (no self-cost, destroy 5 enemies) =====
  function ensureEnemiesForLightningSafe(player, desiredCount) {
    return ensureEnemiesForLightning(state, player, desiredCount);
  }

  async function useLightning() {
    if (state.busy || state.gameOver) return;
    if (state.awaitingChoice) return;

    const player = state.turn;
    computeLegal(state);

    if (!isBothNoMoves(state)) return;
    if (countItems(state, player) <= 0) return;

    state.busy = true;
    try {
      const enemyCells = ensureEnemiesForLightningSafe(player, 5);
      if (!enemyCells || enemyCells.length === 0) return;

      decItem(state, player);

      shuffle(enemyCells);
      const destroyed = enemyCells.slice(0, Math.min(5, enemyCells.length));
      if (destroyed.length === 0) return;

      spawnLightningAnim(destroyed);
      await sleep(110);

      for (const [x, y] of destroyed) set(x, y, EMPTY);
      for (const [x, y] of destroyed) set(x, y, player);

      const { bingoCount } = await resolveAfterChange(player);

      computeLegalAndReach();
      updateTurnAndPassIfNeeded(state);
      recomputeReachAndHud();

      handleBonusAfterTurn(player, bingoCount);

      checkEndOrHandleLightningChoice();

      if (state.mode === 'cpu' && state.turn === W && !state.gameOver && !state.awaitingChoice) {
        if (isBothNoMoves(state) && countItems(state, W) > 0) {
          toast('CPUが⚡稲妻を使った！');
          setTimeout(useLightning, 120);
        } else {
          setTimeout(cpuStep, 220);
        }
      }
    } catch (e) {
      console.error('useLightning failed', e);
    } finally {
      state.busy = false;
      syncHud();
    }
  }

  // ===== moves =====
  function collectFlipsFromOccupied(x, y, player) {
    const opp = opponent(player);
    const flips = [];

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      let cx = x + dx,
        cy = y + dy;
      const line = [];
      while (inBounds(cx, cy)) {
        const s = get(cx, cy);
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

  async function applyReverseAt(x, y) {
    if (state.busy || state.gameOver || state.awaitingChoice) return;
    if (!state.reverseMode) return;

    const player = state.turn;
    const target = get(x, y);
    if (target !== opponent(player)) {
      toast('相手の駒を選んでください');
      state.reverseMode = false;
      syncHud();
      return;
    }
    if (countReverseItems(state, player) <= 0) {
      state.reverseMode = false;
      syncHud();
      return;
    }

    state.busy = true;
    state.reverseMode = false;
    try {
      decReverseItem(state, player);
      set(x, y, player);
      const flips = collectFlipsFromOccupied(x, y, player);
      const flipCount = flips.length;
      for (const [fx, fy] of flips) set(fx, fy, player);
      state.lastMove = { x, y, player, flips: flips.length, reverse: true };
      applyBonusFlipScore(state, player, flipCount);

      const { bingoCount } = await resolveAfterChange(player);

      state.turn = opponent(state.turn);
      computeLegalAndReach();
      updateTurnAndPassIfNeeded(state);
      recomputeReachAndHud();

      handleBonusAfterTurn(player, bingoCount);

      const handled = checkEndOrHandleLightningChoice();
      if (handled) return;

      if (state.mode === 'cpu' && state.turn === W) {
        setTimeout(cpuStep, 220);
      }
    } finally {
      state.busy = false;
      syncHud();
    }
  }

  function placeMove(x, y) {
    if (state.busy || state.gameOver || state.awaitingChoice) return;
    if (!(x >= 0 && x < N && y >= 0 && y < N)) return;
    const k = key(x, y);
    if (!state.legal.has(k)) return;

    const player = state.turn;
    const flips = collectFlips(state, x, y, player);
    const flipCount = flips.length;

    state.busy = true;
    set(x, y, player);
    for (const [fx, fy] of flips) set(fx, fy, player);
    state.lastMove = { x, y, player, flips: flips.length };
    applyBonusFlipScore(state, player, flipCount);

    (async () => {
      try {
        const { bingoCount } = await resolveAfterChange(player);

        state.turn = opponent(state.turn);
        computeLegalAndReach();
        updateTurnAndPassIfNeeded(state);
        recomputeReachAndHud();

        handleBonusAfterTurn(player, bingoCount);

        const handled = checkEndOrHandleLightningChoice();
        if (handled) return;

        if (state.mode === 'cpu' && state.turn === W) {
          setTimeout(cpuStep, 220);
        }
      } finally {
        state.busy = false;
        syncHud();
      }
    })();
  }

  function cpuStep() {
    if (state.busy || state.gameOver || state.awaitingChoice) return;
    if (state.turn !== W) return;

    computeLegalAndReach();
    updateTurnAndPassIfNeeded(state);
    if (state.turn !== W) return;

    if (isBothNoMoves(state)) {
      if (countItems(state, W) > 0) {
        toast('CPUが⚡稲妻を使った！');
        useLightning();
      } else {
        declareGameOver();
      }
      return;
    }

    if (state.legal.size === 0) {
      checkEndOrHandleLightningChoice();
      return;
    }

    const best = chooseCpuMove(state);
    if (best) placeMove(best.x, best.y);
  }

  // ===== UI =====
  function syncHud() {
    const th = THEMES[state.theme] || THEMES.neon;
    document.body.style.background = th.pageBg;

    titlePill.textContent = 'REVINGO';

    turnPill.textContent = `手番: ${state.turn === B ? '黒(あなた)' : '白(CPU)'}${state.busy ? '（処理中）' : ''}${state.gameOver ? '（終了）' : ''}`;
    scorePill.textContent = `得点 黒:${state.scoreB} / 白:${state.scoreW}`;
    diffPill.textContent = `スコア差(自分-敵): ${state.scoreB - state.scoreW}`;
    itemPill.textContent = `⚡ 黒:${state.itemB} / 白:${state.itemW}`;
    if (reversePill) reversePill.textContent = `🔄 黒:${state.reverseB} / 白:${state.reverseW}`;
    const gaugeText = (player) => {
      const gauge = player === B ? state.bingoGaugeB : state.bingoGaugeW;
      const turns = player === B ? state.bonusTurnsB : state.bonusTurnsW;
      return turns > 0 ? `${gauge}/3 (残り${turns}手)` : `${gauge}/3`;
    };
    if (gaugePill) gaugePill.textContent = `連続ボーナス: 黒 ${gaugeText(B)} / 白 ${gaugeText(W)}`;

    const canUse = !state.busy && !state.gameOver && !state.awaitingChoice && countItems(state, state.turn) > 0 && isBothNoMoves(state);
    lightningBtn.disabled = !canUse;
    const canReverse = !state.busy && !state.gameOver && !state.awaitingChoice && countReverseItems(state, state.turn) > 0;
    reverseBtn.disabled = !canReverse;
    if (diffSel) diffSel.disabled = state.mode !== 'cpu';
  }

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme && THEMES[savedTheme]) state.theme = savedTheme;
  themeSel.value = state.theme;
  modeSel.value = 'cpu';
  diffSel.value = 'normal';

  themeSel.addEventListener('change', () => {
    state.theme = themeSel.value;
    localStorage.setItem('theme', state.theme);
    syncHud();
  });

  diffSel.addEventListener('change', () => {
    state.difficulty = diffSel.value || 'normal';
  });

  modeSel.addEventListener('change', () => {
    state.mode = modeSel.value;
    syncHud();
    if (!state.gameOver && state.mode === 'cpu' && state.turn === W && !state.awaitingChoice) {
      setTimeout(cpuStep, 220);
    }
  });

  lightningBtn.addEventListener('click', () => useLightning());

  function canUseReverse(state) {
    return (
      !state.busy &&
      !state.gameOver &&
      !state.awaitingChoice &&
      countReverseItems(state, state.turn) > 0
    );
  }

  reverseBtn.addEventListener('click', () => {
    if (canUseReverse(state)) {
      state.reverseMode = true;
      toast('反転：相手の駒をタップ');
    }
  });
  resetBtn.addEventListener('click', () => {
    hideOverlay();
    resetGameUi();
  });

  rulesBtn.addEventListener('click', () => rules.classList.add('show'));
  rulesClose.addEventListener('click', () => rules.classList.remove('show'));

  // ===== input mapping =====
  function boardRect() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width,
      h = rect.height;
    const size = Math.min(w, h) * 0.94;
    const x = (w - size) / 2;
    const y = (h - size) / 2;
    return { x, y, size, cell: size / N };
  }

  function pointToCell(mx, my) {
    const rect = canvas.getBoundingClientRect();
    const x = mx - rect.left;
    const y = my - rect.top;
    const br = boardRect();
    if (x < br.x || y < br.y || x >= br.x + br.size || y >= br.y + br.size) return null;
    const cx = Math.floor((x - br.x) / br.cell);
    const cy = Math.floor((y - br.y) / br.cell);
    return { cx, cy };
  }

  canvas.addEventListener('pointerup', (e) => {
    const c = pointToCell(e.clientX, e.clientY);
    if (!c) return;
    if (state.reverseMode) {
      applyReverseAt(c.cx, c.cy);
      return;
    }
    placeMove(c.cx, c.cy);
  });

  // ===== render =====
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function drawStone(px, py, r, player) {
    const th = THEMES[state.theme] || THEMES.neon;
    const c = th.stones[player];
    if (!c) return;
    const isNeon = state.theme === 'neon';

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(px + r * 0.12, py + r * 0.16, r * 1.05, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    const edgeWidth = Math.max(1, r * 0.18);
    const edgeRadius = r * 0.98;

    // ネオンは縁取りのグローだけ影を付け、塗りつぶしは影なしで純粋な色を出す
    if (isNeon) {
      ctx.save();
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = r * 0.9;

      // グロー付きの枠線
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = edgeWidth;
      ctx.beginPath();
      ctx.arc(px, py, edgeRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // 中心色（影なしでクッキリ表示）
    if (isNeon && c.core) {
      const grad = ctx.createRadialGradient(px - r * 0.1, py - r * 0.1, r * 0.12, px, py, r * 0.94);
      grad.addColorStop(0, c.core);
      grad.addColorStop(0.4, c.main);
      grad.addColorStop(1, c.main);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = c.main;
    }
    ctx.beginPath();
    ctx.arc(px, py, r * 0.9, 0, Math.PI * 2);
    ctx.fill();

    // 縁取り（影の有無に関わらず安定したラインを重ねる）
    ctx.strokeStyle = c.edge;
    ctx.lineWidth = edgeWidth;
    ctx.beginPath();
    ctx.arc(px, py, edgeRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = c.hi;
    ctx.beginPath();
    ctx.ellipse(px - r * 0.35, py - r * 0.38, r * 0.55, r * 0.32, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width,
      h = rect.height;

    const th = THEMES[state.theme] || THEMES.neon;

    const sh = state.shake;
    const sx = sh ? (Math.random() * 2 - 1) * sh : 0;
    const sy = sh ? (Math.random() * 2 - 1) * sh : 0;
    state.shake = Math.max(0, state.shake - 0.2);

    state.flash = Math.max(0, state.flash - 0.045);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = th.pageBg;
    ctx.fillRect(0, 0, w, h);

    const br = boardRect();
    const bx = br.x + sx,
      by = br.y + sy,
      size = br.size,
      cs = br.cell;

    ctx.fillStyle = th.boardFrame;
    ctx.beginPath();
    ctx.roundRect(bx - cs * 0.18, by - cs * 0.18, size + cs * 0.36, size + cs * 0.36, Math.min(22, size * 0.06));
    ctx.fill();

    ctx.fillStyle = th.boardBg;
    ctx.beginPath();
    ctx.roundRect(bx, by, size, size, Math.min(18, size * 0.06));
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = th.grid;
    for (let i = 0; i <= N; i++) {
      const x = bx + i * cs;
      ctx.beginPath();
      ctx.moveTo(x, by);
      ctx.lineTo(x, by + size);
      ctx.stroke();
      const y = by + i * cs;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.lineTo(bx + size, y);
      ctx.stroke();
    }

    // reach highlight
    {
      const t = performance.now() / 1000;
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = th.reach;
      ctx.lineWidth = Math.max(2, cs * (0.06 + 0.03 * pulse));

      for (const d of state.reach.defs) {
        ctx.beginPath();
        if (d.kind === 'row') {
          const y = by + (d.idx + 0.5) * cs;
          ctx.moveTo(bx + cs * 0.28, y);
          ctx.lineTo(bx + size - cs * 0.28, y);
        } else if (d.kind === 'col') {
          const x = bx + (d.idx + 0.5) * cs;
          ctx.moveTo(x, by + cs * 0.28);
          ctx.lineTo(x, by + size - cs * 0.28);
        } else if (d.kind === 'diag' && d.idx === 0) {
          const pad = cs * 0.28;
          ctx.moveTo(bx + pad, by + pad);
          ctx.lineTo(bx + size - pad, by + size - pad);
        } else {
          const pad = cs * 0.28;
          ctx.moveTo(bx + size - pad, by + pad);
          ctx.lineTo(bx + pad, by + size - pad);
        }
        ctx.stroke();
      }

      ctx.setLineDash([cs * 0.18, cs * 0.12]);
      ctx.strokeStyle = th.reachCell;
      ctx.lineWidth = Math.max(2, cs * (0.05 + 0.03 * pulse));
      for (const e of state.reach.empties) {
        const px = bx + e.x * cs;
        const py = by + e.y * cs;
        ctx.beginPath();
        ctx.roundRect(px + cs * 0.1, py + cs * 0.1, cs * 0.8, cs * 0.8, cs * 0.18);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (!state.gameOver && !state.awaitingChoice) {
      ctx.fillStyle = th.legal;
      for (const kk of state.legal) {
        const [x, y] = kk.split(',').map(Number);
        const px = bx + x * cs,
          py = by + y * cs;
        ctx.beginPath();
        ctx.roundRect(px + cs * 0.16, py + cs * 0.16, cs * 0.68, cs * 0.68, cs * 0.16);
        ctx.fill();
      }
    }

    if (state.lastMove) {
      const { x, y } = state.lastMove;
      const px = bx + x * cs,
        py = by + y * cs;
      ctx.strokeStyle = th.last;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(px + cs * 0.1, py + cs * 0.1, cs * 0.8, cs * 0.8, cs * 0.18);
      ctx.stroke();
    }

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const s = get(x, y);
        if (s === EMPTY) continue;
        const cx = bx + x * cs + cs / 2;
        const cy = by + y * cs + cs / 2;
        drawStone(cx, cy, cs * 0.4, s);
      }
    }

    for (const a of state.anims) a.t += 1 / 60;
    state.anims = state.anims.filter((a) => {
      if (a.type === 'pop') return a.t < 0.55;
      if (a.type === 'score') return a.t < 0.9;
      if (a.type === 'spark') return a.t < a.life;
      if (a.type === 'line') return a.t < 0.52;
      if (a.type === 'bolt') return a.t < 0.28;
      if (a.type === 'bingo') return a.t < 0.8;
      return a.t < 0.8;
    });

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const a of state.anims) {
      if (a.type !== 'line') continue;
      const p = easeOutCubic(clamp(a.t / 0.52, 0, 1));
      const alpha = (1 - p) * 0.95;
      const glow = cs * (0.11 + 0.26 * (1 - p));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(255,220,150,${alpha})`;
      ctx.lineWidth = Math.max(2, glow);
      ctx.beginPath();
      if (a.kind === 'row') {
        const y = by + (a.idx + 0.5) * cs;
        const x1 = bx + cs * 0.25;
        const x2 = bx + size - cs * 0.25;
        const xm = x1 + (x2 - x1) * p;
        ctx.moveTo(x1, y);
        ctx.lineTo(xm, y);
      } else if (a.kind === 'col') {
        const x = bx + (a.idx + 0.5) * cs;
        const y1 = by + cs * 0.25;
        const y2 = by + size - cs * 0.25;
        const ym = y1 + (y2 - y1) * p;
        ctx.moveTo(x, y1);
        ctx.lineTo(x, ym);
      } else {
        const pad = cs * 0.25;
        if (a.idx === 0) {
          const x1 = bx + pad,
            y1 = by + pad;
          const x2 = bx + size - pad,
            y2 = by + size - pad;
          const xm = x1 + (x2 - x1) * p;
          const ym = y1 + (y2 - y1) * p;
          ctx.moveTo(x1, y1);
          ctx.lineTo(xm, ym);
        } else {
          const x1 = bx + size - pad,
            y1 = by + pad;
          const x2 = bx + pad,
            y2 = by + size - pad;
          const xm = x1 + (x2 - x1) * p;
          const ym = y1 + (y2 - y1) * p;
          ctx.moveTo(x1, y1);
          ctx.lineTo(xm, ym);
        }
      }
      ctx.stroke();
    }

    for (const a of state.anims) {
      if (a.type !== 'bolt') continue;
      const p = clamp(a.t / 0.28, 0, 1);
      const alpha = (1 - p) * 0.95;
      const pts = a.pts;
      ctx.strokeStyle = `rgba(200,235,255,${alpha})`;
      ctx.lineWidth = Math.max(2, cs * 0.085);
      ctx.beginPath();
      ctx.moveTo(bx + pts[0].x * cs, by + pts[0].y * cs);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(bx + pts[i].x * cs, by + pts[i].y * cs);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = Math.max(1, cs * 0.03);
      ctx.beginPath();
      ctx.moveTo(bx + pts[0].x * cs, by + pts[0].y * cs);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(bx + pts[i].x * cs, by + pts[i].y * cs);
      ctx.stroke();
    }

    for (const a of state.anims) {
      if (a.type !== 'spark') continue;
      const p = clamp(a.t / a.life, 0, 1);
      const alpha = (1 - p) * 0.85;
      const x = bx + (a.x + a.vx * p * 0.18) * cs;
      const y = by + (a.y + a.vy * p * 0.18) * cs;
      ctx.fillStyle = `rgba(255,220,140,${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.2, cs * 0.03 * (1 - p)), 0, Math.PI * 2);
      ctx.fill();
    }

    // BINGO stamp
    for (const a of state.anims) {
      if (a.type !== 'bingo') continue;
      const t = clamp(a.t / 0.8, 0, 1);
      const bump = t < 0.55 ? 0.7 + (1.15 - 0.7) * easeOutCubic(t / 0.55) : 1.15 + (1.0 - 1.15) * easeOutCubic((t - 0.55) / 0.45);
      const alpha = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.15) / 0.85);
      const cx = bx + a.x * cs + cs / 2;
      const cy = by + a.y * cs + cs / 2;
      const text = bingoLabel(a.lines || 1);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(bump, bump);

      if (state.theme === 'neon') {
        ctx.shadowColor = th.bingoGlow;
        ctx.shadowBlur = cs * 0.7;
      }

      ctx.font = `900 ${Math.max(20, cs * 0.82)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = th.bingo;
      ctx.lineWidth = Math.max(3, cs * 0.1);
      ctx.strokeStyle = `rgba(0,0,0,${0.55 * alpha})`;
      ctx.strokeText(text, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.fillText(text, 0, 0);
      ctx.globalAlpha = 1;

      ctx.restore();
    }

    ctx.restore();

    for (const a of state.anims) {
      if (a.type === 'pop') {
        const p = easeOutCubic(clamp(a.t / 0.55, 0, 1));
        const alpha = 1 - p;
        const cx = bx + a.x * cs + cs / 2;
        const cy = by + a.y * cs + cs / 2;
        const r = cs * (0.46 + 0.3 * p);
        ctx.strokeStyle = `rgba(255,255,255,${0.18 * alpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (a.type === 'score') {
        const p = easeOutCubic(clamp(a.t / 0.9, 0, 1));
        const alpha = 1 - p;
        const cx = bx + a.x * cs + cs / 2;
        const cy = by + a.y * cs + cs / 2 - cs * (0.8 * p);
        if (state.theme === 'neon') {
          ctx.font = `bold ${Math.max(18, cs * 0.7)}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.fillText(`+${a.value}`, cx, cy);
          if ((a.lines || 1) > 1) {
            ctx.font = `bold ${Math.max(14, cs * 0.45)}px system-ui`;
            ctx.fillStyle = `hsla(${state.flashHue},100%,70%,${alpha})`;
            ctx.fillText(`COMBO x${a.lines}`, cx, cy + cs * 0.55);
          }
        } else {
          ctx.font = `bold ${Math.max(16, cs * 0.6)}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = `rgba(255,220,140,${alpha})`;
          ctx.fillText(`+${a.value}`, cx, cy);
          if ((a.lines || 1) > 1) {
            ctx.font = `bold ${Math.max(12, cs * 0.38)}px system-ui`;
            ctx.fillStyle = `rgba(255,235,180,${alpha})`;
            ctx.fillText(`COMBO x${a.lines}`, cx, cy + Math.max(14, cs * 0.42));
          }
        }
      }
    }

    if (state.flash > 0) {
      const a = state.flash;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `hsla(${state.flashHue}, 95%, 60%, ${0.18 * a})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    requestAnimationFrame(draw);
  }

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  // ===== boot =====
  fitCanvas();
  resetGameUi();
  requestAnimationFrame(draw);
})();
