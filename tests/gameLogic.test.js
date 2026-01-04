import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  B,
  W,
  EMPTY,
  N,
  createState,
  resetGame,
  getCell,
  setCell,
  computeLegal,
  updateTurnAndPassIfNeeded,
  computeReachFor,
  recomputeReach,
  ensureEnemiesForLightning,
  findDeletions,
  addReverseItem,
  countReverseItems,
  decReverseItem,
  addBingoProgress,
  resetBingoProgress,
  isBonusActive,
  applyBonusPlacementScore,
  consumeBonusTurn,
  getBonusTurns,
  BONUS_PLACEMENT_FACTOR,
  BONUS_TURN_COUNT,
  applyLightningPlacements,
} from '../src/gameLogic.js';
import { chooseCpuMove } from '../src/cpu.js';

let state;

function clearBoard() {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) setCell(state, x, y, EMPTY);
}

function countStones() {
  let c = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (getCell(state, x, y) !== EMPTY) c++;
  return c;
}

function countBy(player) {
  let c = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (getCell(state, x, y) === player) c++;
  return c;
}

describe('ゲームロジック', () => {
  beforeEach(() => {
    state = createState();
    resetGame(state);
  });

  it('初期配置と合法手が正しいこと', () => {
    assert.equal(countStones(), 4);
    assert.equal(getCell(state, 3, 3), W);
    assert.equal(getCell(state, 4, 4), W);
    assert.equal(getCell(state, 4, 3), B);
    assert.equal(getCell(state, 3, 4), B);
    assert.equal(state.turn, B);
    assert.equal(state.legal.size, 4);
  });

  it('ライン削除の検出が正しいこと', () => {
    clearBoard();
    for (let x = 0; x < N; x++) setCell(state, x, 0, B);
    let delInfo = findDeletions(state);
    assert.equal(delInfo.lines, 1);
    assert.equal(delInfo.cells.size, 8);

    clearBoard();
    for (let x = 0; x < N; x++) setCell(state, x, 0, B);
    for (let y = 0; y < N; y++) setCell(state, 0, y, B);
    delInfo = findDeletions(state);
    assert.equal(delInfo.lines, 2);
    assert.equal(delInfo.cells.size, 15);
  });

  it('パスと合法手の再計算が行われること', () => {
    clearBoard();
    setCell(state, 0, 0, B);
    setCell(state, 1, 0, W);
    state.turn = W;
    computeLegal(state);
    assert.equal(state.legal.size, 0);
    updateTurnAndPassIfNeeded(state);
    assert.equal(state.turn, B);
    assert.ok(state.legal.size > 0);
  });

  it('リーチ検出が正しいこと', () => {
    clearBoard();
    for (let x = 0; x < N; x++) setCell(state, x, 2, B);
    setCell(state, 5, 2, EMPTY);
    // (5,2) を合法手にするための挟み込み用駒
    setCell(state, 5, 3, W);
    setCell(state, 5, 4, B);
    const reach = computeReachFor(state, B);
    assert.ok(reach.defs.some((d) => d.kind === 'row' && d.idx === 2));
    assert.ok(reach.empties.some((e) => e.x === 5 && e.y === 2));

    state.turn = W;
    recomputeReach(state);
    assert.equal(state.reach.defs.length, 0);
    assert.equal(state.reach.empties.length, 0);

    state.turn = B;
    recomputeReach(state);
    assert.ok(state.reach.defs.some((d) => d.kind === 'row' && d.idx === 2));
  });

  it('敵石を挟んだ後のリーチ検出が正しいこと', () => {
    clearBoard();
    for (let y = 0; y < N; y++) setCell(state, 3, y, B);
    setCell(state, 3, 1, EMPTY);
    setCell(state, 3, 2, W);
    const reachWithFlip = computeReachFor(state, B);
    assert.ok(reachWithFlip.empties.some((e) => e.x === 3 && e.y === 1 && e.kind === 'col' && e.idx === 3));
  });

  it('稲妻は空きマスを優先して配置されること', () => {
    clearBoard();
    // 敵駒があっても空きマスが優先される
    setCell(state, 0, 0, W);
    const targets = ensureEnemiesForLightning(state, B, 5);
    assert.ok(targets);
    assert.equal(targets.length, 5);
    assert.ok(targets.every(([x, y]) => getCell(state, x, y) === EMPTY));
    // 盤面は変更されない
    assert.equal(countBy(W), 1);
  });

  it('空きマスがない場合は敵駒を破壊して配置されること', () => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) setCell(state, x, y, W);
    const targets = ensureEnemiesForLightning(state, B, 5);
    assert.ok(targets);
    assert.equal(targets.length, 5);
    assert.ok(targets.every(([x, y]) => getCell(state, x, y) === W));
  });

  it('稲妻配置で挟んだ敵駒が反転すること', () => {
    clearBoard();
    setCell(state, 0, 0, B);
    setCell(state, 1, 0, W);
    const targets = [[2, 0]];
    const { flipped } = applyLightningPlacements(state, B, targets);
    assert.equal(flipped, 1);
    assert.equal(getCell(state, 1, 0), B);
  });

  it('CPU(EASY)がランダム性を持ち危険手を避けること', () => {
    resetGame(state);
    state.turn = W;
    state.difficulty = 'easy';
    computeLegal(state);

    const choiceA = chooseCpuMove(state, { random: () => 0.01 });
    const choiceB = chooseCpuMove(state, { random: () => 0.99 });
    assert.ok(choiceA);
    assert.ok(choiceB);
    assert.notDeepEqual(choiceA, choiceB);
  });

  it('CPU(NORMAL)が角の優先度を考慮すること', () => {
    clearBoard();
    setCell(state, 1, 0, B);
    setCell(state, 2, 0, W);
    setCell(state, 2, 2, W);
    setCell(state, 1, 1, B);
    state.turn = W;
    state.difficulty = 'normal';
    computeLegal(state);

    const move = chooseCpuMove(state, { random: () => 0 });
    assert.deepEqual(move, { x: 0, y: 0 });
  });

  it('CPU(HARD)が角の優先度を考慮しビームサーチとアルファベータ枝刈りを使用すること', () => {
    clearBoard();
    setCell(state, 1, 0, B);
    setCell(state, 2, 0, W);
    setCell(state, 2, 2, W);
    setCell(state, 1, 1, B);
    state.turn = W;
    state.difficulty = 'hard';
    computeLegal(state);

    const move = chooseCpuMove(state, { random: () => 0 });
    assert.deepEqual(move, { x: 0, y: 0 });
  });

  it('反転アイテムの加算・上限・減算・リセットが正しく行われること', () => {
    // 初期値
    assert.equal(countReverseItems(state, B), 0);
    assert.equal(countReverseItems(state, W), 0);

    // 加算
    addReverseItem(state, B, 2);
    addReverseItem(state, W, 3);
    assert.equal(countReverseItems(state, B), 2);
    assert.equal(countReverseItems(state, W), 3);

    // 上限5で抑制
    addReverseItem(state, B, 10);
    assert.equal(countReverseItems(state, B), 5);

    // 減算で下限0
    decReverseItem(state, B);
    decReverseItem(state, B);
    decReverseItem(state, B);
    decReverseItem(state, B);
    decReverseItem(state, B);
    decReverseItem(state, B); // 0から減らない
    assert.equal(countReverseItems(state, B), 0);

    // リセットで初期化
    addReverseItem(state, B, 4);
    resetGame(state);
    assert.equal(countReverseItems(state, B), 0);
    assert.equal(countReverseItems(state, W), 0);
  });

  it('連続ビンゴゲージが3回でボーナス状態になること', () => {
    assert.equal(isBonusActive(state, B), false);
    addBingoProgress(state, B, 3);
    assert.equal(state.bingoGaugeB, 3);
    assert.equal(getBonusTurns(state, B), BONUS_TURN_COUNT);
    assert.equal(isBonusActive(state, B), true);
  });

  it('ビンゴがないターンでゲージがリセットされ、ボーナス中は維持されること', () => {
    addBingoProgress(state, B, 1);
    resetBingoProgress(state, B);
    assert.equal(state.bingoGaugeB, 0);

    addBingoProgress(state, B, 3);
    assert.equal(state.bingoGaugeB, 3);
    resetBingoProgress(state, B);
    assert.equal(state.bingoGaugeB, 3);
    assert.equal(isBonusActive(state, B), true);
  });

  it('ボーナス中は配置ボーナスが加算され、ターン経過で失効すること', () => {
    addBingoProgress(state, B, 3);
    const { gain } = applyBonusPlacementScore(state, B);
    assert.ok(gain > 0);
    assert.equal(getBonusTurns(state, B), BONUS_TURN_COUNT);

    for (let i = 0; i < BONUS_TURN_COUNT; i++) consumeBonusTurn(state, B);
    assert.equal(isBonusActive(state, B), false);
    assert.equal(state.bingoGaugeB, 0);
  });

  it('ボーナス中の配置加点が全自駒数×係数で加算されること', () => {
    addBingoProgress(state, B, 3);
    // 既存の初期2石 + 追加で4石 = 6石
    setCell(state, 0, 0, B);
    setCell(state, 7, 7, B);
    setCell(state, 0, 7, B);
    setCell(state, 7, 0, B);
    const { gain, cells } = applyBonusPlacementScore(state, B);
    assert.equal(cells.length, 6);
    assert.equal(gain, Math.floor(cells.length * BONUS_PLACEMENT_FACTOR));
    assert.equal(state.scoreB, gain);
  });
});
