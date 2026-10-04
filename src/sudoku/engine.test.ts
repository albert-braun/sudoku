import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  blocksFor,
  candidates,
  conflicts,
  countSolutions,
  generatePuzzle,
  type Difficulty,
} from './engine.ts'

test('a repeated digit is marked in both cells', () => {
  const grid = Array.from({ length: 81 }, () => 0)
  grid[0] = 5
  grid[1] = 5
  const bad = conflicts(grid)
  assert.equal(bad[0], true)
  assert.equal(bad[1], true)
  assert.equal(bad[2], false)
})

test('candidates drop digits already used by a peer', () => {
  const grid = Array.from({ length: 81 }, () => 0)
  grid[1] = 4
  grid[9] = 7
  grid[10] = 2
  const open = candidates(grid, 0)
  assert.equal(open.includes(4), false)
  assert.equal(open.includes(7), false)
  assert.equal(open.includes(2), false)
  assert.equal(blocksFor(grid, 0, 4)[0]?.unit, 'row')
  assert.equal(blocksFor(grid, 0, 7)[0]?.unit, 'column')
  assert.equal(blocksFor(grid, 0, 2)[0]?.unit, 'box')
})

test('every difficulty is a unique completion of its own solution', () => {
  const levels: Difficulty[] = ['easy', 'medium', 'hard']
  for (const difficulty of levels) {
    const puzzle = generatePuzzle(difficulty, 7)
    assert.equal(countSolutions(puzzle.puzzle.slice(), 2), 1, difficulty)
    assert.equal(conflicts(puzzle.solution).some(Boolean), false, difficulty)
    for (let index = 0; index < 81; index++) {
      if (puzzle.puzzle[index]) assert.equal(puzzle.puzzle[index], puzzle.solution[index])
    }
    const replay = puzzle.puzzle.slice()
    for (const step of puzzle.steps) replay[step.index] = step.digit
    assert.deepEqual(replay, puzzle.solution)
  }
})
