import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  B,
  W,
  EMPTY,
  N,
  createState,
  setCell,
  getCell,
  findDeletions,
  addReverseItem,
  countReverseItems,
  addScore,
  comboGain,
} from '../src/gameLogic.js';

describe('統合テスト：ビンゴと反転アイテム', () => {
  it('ビンゴが成立したときに反転アイテムが追加されること', () => {
    const state = createState();
    
    // Clear the board
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        setCell(state, x, y, EMPTY);
      }
    }
    
    // Create a full row for player B (simulating a bingo)
    for (let x = 0; x < N; x++) {
      setCell(state, x, 0, B);
    }
    
    // Initial state
    assert.equal(countReverseItems(state, B), 0);
    
    // Simulate what resolveAfterChange does
    const delInfo = findDeletions(state);
    assert.equal(delInfo.lines, 1, 'Should detect 1 bingo line');
    
    if (delInfo.lines > 0) {
      addReverseItem(state, B, delInfo.lines);
    }
    
    // After bingo, reverse items should be added
    assert.equal(countReverseItems(state, B), 1, 'Player B should have 1 reverse item');
  });
  
  it('複数ラインのビンゴで複数の反転アイテムが追加されること', () => {
    const state = createState();
    
    // Clear the board
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        setCell(state, x, y, EMPTY);
      }
    }
    
    // Create a full row AND a full column for player B
    for (let x = 0; x < N; x++) {
      setCell(state, x, 0, B); // Row 0
    }
    for (let y = 0; y < N; y++) {
      setCell(state, 0, y, B); // Column 0
    }
    
    // Initial state
    assert.equal(countReverseItems(state, B), 0);
    
    // Simulate what resolveAfterChange does
    const delInfo = findDeletions(state);
    assert.equal(delInfo.lines, 2, 'Should detect 2 bingo lines');
    
    if (delInfo.lines > 0) {
      addReverseItem(state, B, delInfo.lines);
    }
    
    // After double bingo, should have 2 reverse items
    assert.equal(countReverseItems(state, B), 2, 'Player B should have 2 reverse items');
  });
});
