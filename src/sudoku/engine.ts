export type Difficulty = 'easy' | 'medium' | 'hard'

export const CLUES: Record<Difficulty, number> = {
  easy: 40,
  medium: 32,
  hard: 26,
}

export type Step = {
  index: number
  digit: number
  kind: 'single' | 'search'
}

export type Puzzle = {
  difficulty: Difficulty
  seed: number
  puzzle: number[]
  solution: number[]
  clues: number
  rejected: number
  steps: Step[]
}

export type Unit = 'row' | 'column' | 'box'

export type Block = {
  index: number
  unit: Unit
}

const SIZE = 9
const CELLS = 81

export function rowOf(index: number) {
  return Math.floor(index / SIZE)
}

export function colOf(index: number) {
  return index % SIZE
}

export function boxOf(index: number) {
  return Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3)
}

export function cellName(index: number) {
  return `r${rowOf(index) + 1} c${colOf(index) + 1}`
}

function buildPeers() {
  return Array.from({ length: CELLS }, (_, index) => {
    const peers = new Set<number>()
    const row = rowOf(index)
    const col = colOf(index)
    for (let offset = 0; offset < SIZE; offset++) {
      peers.add(row * SIZE + offset)
      peers.add(offset * SIZE + col)
    }
    const boxRow = Math.floor(row / 3) * 3
    const boxCol = Math.floor(col / 3) * 3
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) peers.add((boxRow + r) * SIZE + (boxCol + c))
    }
    peers.delete(index)
    return [...peers]
  })
}

export const PEERS = buildPeers()

function candidateMask(grid: readonly number[], index: number) {
  let mask = 0x1ff
  for (const peer of PEERS[index]!) {
    const digit = grid[peer]
    if (digit) mask &= ~(1 << (digit - 1))
  }
  return mask
}

function bitCount(mask: number) {
  let count = 0
  let bits = mask
  while (bits) {
    count += bits & 1
    bits >>= 1
  }
  return count
}

function digitsFromMask(mask: number) {
  const digits: number[] = []
  for (let digit = 1; digit <= 9; digit++) {
    if (mask & (1 << (digit - 1))) digits.push(digit)
  }
  return digits
}

function emptiest(grid: readonly number[]) {
  let index = -1
  let mask = 0
  let count = 10
  for (let cell = 0; cell < CELLS; cell++) {
    if (grid[cell]) continue
    const bits = candidateMask(grid, cell)
    const size = bitCount(bits)
    if (size < count) {
      index = cell
      mask = bits
      count = size
      if (size === 0) break
    }
  }
  return index < 0 ? null : { index, mask, count }
}

/** How many completions exist, stopping once `limit` is reached. */
export function countSolutions(grid: number[], limit = 2): number {
  const cell = emptiest(grid)
  if (!cell) return 1
  if (cell.count === 0) return 0
  let found = 0
  for (const digit of digitsFromMask(cell.mask)) {
    grid[cell.index] = digit
    found += countSolutions(grid, limit - found)
    grid[cell.index] = 0
    if (found >= limit) return found
  }
  return found
}

export function conflicts(grid: readonly number[]) {
  const bad = Array.from({ length: CELLS }, () => false)
  for (let index = 0; index < CELLS; index++) {
    const digit = grid[index]
    if (!digit) continue
    for (const peer of PEERS[index]!) {
      if (grid[peer] === digit) {
        bad[index] = true
        bad[peer] = true
      }
    }
  }
  return bad
}

export function candidates(grid: readonly number[], index: number) {
  if (grid[index]) return []
  return digitsFromMask(candidateMask(grid, index))
}

export function blocksFor(grid: readonly number[], index: number, digit: number): Block[] {
  const hits: Block[] = []
  for (const peer of PEERS[index]!) {
    if (grid[peer] !== digit) continue
    const unit: Unit =
      rowOf(peer) === rowOf(index) ? 'row' : colOf(peer) === colOf(index) ? 'column' : 'box'
    hits.push({ index: peer, unit })
  }
  return hits
}

function fill(grid: number[], rng: () => number): boolean {
  const cell = emptiest(grid)
  if (!cell) return true
  if (cell.count === 0) return false
  const digits = shuffle(digitsFromMask(cell.mask), rng)
  for (const digit of digits) {
    grid[cell.index] = digit
    if (fill(grid, rng)) return true
    grid[cell.index] = 0
  }
  return false
}

/**
 * Fill a complete grid, then clear cells in random order.
 * A clearance is kept only when exactly one completion remains.
 */
export function generatePuzzle(difficulty: Difficulty, seed: number): Puzzle {
  const rng = mulberry32(seed)
  const solution = Array.from({ length: CELLS }, () => 0)
  if (!fill(solution, rng)) throw new Error('Could not fill a grid')

  const puzzle = solution.slice()
  let clues = CELLS
  let rejected = 0
  const target = CLUES[difficulty]

  for (const index of shuffle(
    Array.from({ length: CELLS }, (_, cell) => cell),
    rng,
  )) {
    if (clues <= target) break
    const saved = puzzle[index]!
    puzzle[index] = 0
    if (countSolutions(puzzle, 2) === 1) clues -= 1
    else {
      puzzle[index] = saved
      rejected += 1
    }
  }

  return {
    difficulty,
    seed,
    puzzle,
    solution,
    clues,
    rejected,
    steps: solvingSteps(puzzle, solution),
  }
}

export function solvingSteps(puzzle: readonly number[], solution: readonly number[]): Step[] {
  const grid = puzzle.slice()
  const steps: Step[] = []
  while (grid.some((digit) => digit === 0)) {
    const single = grid.findIndex((digit, index) => digit === 0 && candidates(grid, index).length === 1)
    if (single >= 0) {
      const digit = solution[single]!
      steps.push({ index: single, digit, kind: 'single' })
      grid[single] = digit
      continue
    }
    const cell = emptiest(grid)
    if (!cell) break
    const digit = solution[cell.index]!
    steps.push({ index: cell.index, digit, kind: 'search' })
    grid[cell.index] = digit
  }
  return steps
}

export function nextStep(grid: readonly number[], solution: readonly number[]): Step | null {
  if (conflicts(grid).some(Boolean)) return null
  if (grid.every((digit) => digit !== 0)) return null
  const steps = solvingSteps(grid, solution)
  return steps[0] ?? null
}

export function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], rng: () => number) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const current = copy[i]!
    copy[i] = copy[j]!
    copy[j] = current
  }
  return copy
}

export function randomSeed() {
  return Math.floor(Math.random() * 0x7fffffff)
}
