import { useEffect, useMemo, useReducer, useRef } from 'react'
import {
  CLUES,
  PEERS,
  blocksFor,
  candidates,
  cellName,
  colOf,
  conflicts,
  countSolutions,
  generatePuzzle,
  nextStep,
  randomSeed,
  rowOf,
  type Difficulty,
  type Puzzle,
} from './engine.ts'
import './sudoku.css'

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']

type Game = {
  puzzle: Puzzle
  play: number[]
  history: { index: number; previous: number }[]
  selected: number
  mode: 'play' | 'proof'
  proofStep: number
  proofPlaying: boolean
  showCandidates: boolean
  notice: string | null
}

type Action =
  | { type: 'deal'; difficulty: Difficulty; seed: number }
  | { type: 'select'; index: number }
  | { type: 'place'; digit: number }
  | { type: 'undo' }
  | { type: 'candidates' }
  | { type: 'enter-proof' }
  | { type: 'exit-proof' }
  | { type: 'proof-step'; step: number }
  | { type: 'proof-advance' }
  | { type: 'proof-play'; value: boolean }
  | { type: 'hint' }

function firstEmpty(puzzle: readonly number[]) {
  const index = puzzle.findIndex((digit) => digit === 0)
  return index < 0 ? 0 : index
}

function dealCopy(difficulty: Difficulty, seed: number): Game {
  const puzzle = generatePuzzle(difficulty, seed)
  return {
    puzzle,
    play: puzzle.puzzle.slice(),
    history: [],
    selected: firstEmpty(puzzle.puzzle),
    mode: 'play',
    proofStep: 0,
    proofPlaying: false,
    showCandidates: false,
    notice: `${puzzle.clues} clues kept. ${puzzle.rejected} removals were put back because a second solution appeared.`,
  }
}

function reducer(state: Game, action: Action): Game {
  switch (action.type) {
    case 'deal':
      return dealCopy(action.difficulty, action.seed)
    case 'select':
      return { ...state, selected: action.index }
    case 'candidates':
      return { ...state, showCandidates: !state.showCandidates }
    case 'undo': {
      if (state.mode !== 'play' || state.history.length === 0) return state
      const history = state.history.slice(0, -1)
      const last = state.history[state.history.length - 1]!
      const play = state.play.slice()
      play[last.index] = last.previous
      return { ...state, play, history, selected: last.index, notice: 'Entry taken back.' }
    }
    case 'place': {
      if (state.mode !== 'play') return state
      const index = state.selected
      if (state.puzzle.puzzle[index]) {
        return { ...state, notice: 'This cell is given.' }
      }
      const play = state.play.slice()
      const previous = play[index]!
      play[index] = action.digit
      const history =
        previous === action.digit
          ? state.history
          : [...state.history, { index, previous }]
      const won = play.every((digit, cell) => digit === state.puzzle.solution[cell])
      return {
        ...state,
        play,
        history,
        notice: won ? 'The grid matches the unique solution.' : null,
      }
    }
    case 'hint': {
      if (state.mode !== 'play') return state
      if (conflicts(state.play).some(Boolean)) {
        return { ...state, notice: 'A digit is repeated in its row, column, or box.' }
      }
      if (countSolutions(state.play.slice(), 1) === 0) {
        return { ...state, notice: 'These entries leave no solution.' }
      }
      const step = nextStep(state.play, state.puzzle.solution)
      if (!step) return { ...state, notice: 'The grid is complete.' }
      const play = state.play.slice()
      const previous = play[step.index]!
      play[step.index] = step.digit
      return {
        ...state,
        play,
        selected: step.index,
        history: [...state.history, { index: step.index, previous }],
        notice:
          step.kind === 'single'
            ? `${step.digit} is the only digit still open in ${cellName(step.index)}.`
            : `No naked single. The unique solution places ${step.digit} in ${cellName(step.index)}.`,
      }
    }
    case 'enter-proof':
      return {
        ...state,
        mode: 'proof',
        proofStep: 0,
        proofPlaying: false,
        notice: 'The checked line, from the opening clues.',
      }
    case 'exit-proof':
      return { ...state, mode: 'play', proofPlaying: false, notice: 'Back on your grid.' }
    case 'proof-play':
      return { ...state, mode: 'proof', proofPlaying: action.value }
    case 'proof-step':
      return {
        ...state,
        mode: 'proof',
        proofPlaying: false,
        proofStep: clampStep(action.step, state.puzzle.steps.length),
        selected: stepCell(state.puzzle, action.step),
        notice: stepNotice(state.puzzle, action.step),
      }
    case 'proof-advance': {
      const proofStep = Math.min(state.proofStep + 1, state.puzzle.steps.length)
      return {
        ...state,
        mode: 'proof',
        proofStep,
        proofPlaying: proofStep >= state.puzzle.steps.length ? false : state.proofPlaying,
        selected: stepCell(state.puzzle, proofStep),
        notice: stepNotice(state.puzzle, proofStep),
      }
    }
    default:
      return state
  }
}

function clampStep(step: number, length: number) {
  return Math.max(0, Math.min(step, length))
}

function stepCell(puzzle: Puzzle, step: number) {
  const item = puzzle.steps[Math.min(step, puzzle.steps.length) - 1]
  return item?.index ?? firstEmpty(puzzle.puzzle)
}

function stepNotice(puzzle: Puzzle, step: number) {
  const item = puzzle.steps[step - 1]
  if (!item) return 'The checked line, from the opening clues.'
  if (item.kind === 'single') return `${item.digit} is the only digit still open in ${cellName(item.index)}.`
  return `No naked single. The unique solution places ${item.digit} in ${cellName(item.index)}.`
}

function shownGrid(state: Game) {
  if (state.mode === 'play') return state.play
  const grid = state.puzzle.puzzle.slice()
  for (let i = 0; i < state.proofStep; i++) {
    const step = state.puzzle.steps[i]!
    grid[step.index] = step.digit
  }
  return grid
}

export function Sudoku() {
  const [state, dispatch] = useReducer(reducer, 0, () => dealCopy('medium', randomSeed()))
  const grid = shownGrid(state)
  const bad = useMemo(() => conflicts(grid), [grid])
  const peers = useMemo(() => new Set(PEERS[state.selected] ?? []), [state.selected])
  const given = state.puzzle.puzzle[state.selected] !== 0
  const value = grid[state.selected] ?? 0
  const openDigits = value ? [] : candidates(grid, state.selected)
  const won =
    state.mode === 'proof'
      ? state.proofStep >= state.puzzle.steps.length
      : state.play.every((digit, index) => digit === state.puzzle.solution[index])

  useEffect(() => {
    const previous = document.title
    document.title = 'Sudoku'
    window.scrollTo(0, 0)
    const id = 'sudo-font'
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href =
        'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520;9..144,640&display=swap'
      document.head.appendChild(link)
    }
    return () => {
      document.title = previous
    }
  }, [])

  useEffect(() => {
    if (!state.proofPlaying) return
    if (state.proofStep >= state.puzzle.steps.length) {
      dispatch({ type: 'proof-play', value: false })
      return
    }
    const timer = window.setTimeout(() => dispatch({ type: 'proof-advance' }), 420)
    return () => window.clearTimeout(timer)
  }, [state.proofPlaying, state.proofStep, state.puzzle.steps.length])

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      const current = stateRef.current
      if (event.key >= '1' && event.key <= '9') {
        dispatch({ type: 'place', digit: Number(event.key) })
      } else if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
        dispatch({ type: 'place', digit: 0 })
      } else if (event.key === 'z' || event.key === 'Z') {
        dispatch({ type: 'undo' })
      } else if (event.key === 'n' || event.key === 'N') {
        dispatch({ type: 'deal', difficulty: current.puzzle.difficulty, seed: randomSeed() })
      } else if (event.key === 'h' || event.key === 'H') {
        dispatch({ type: 'hint' })
      } else if (event.key === 'ArrowLeft') {
        dispatch({ type: 'select', index: (current.selected + 80) % 81 })
      } else if (event.key === 'ArrowRight') {
        dispatch({ type: 'select', index: (current.selected + 1) % 81 })
      } else if (event.key === 'ArrowUp') {
        dispatch({ type: 'select', index: (current.selected + 72) % 81 })
      } else if (event.key === 'ArrowDown') {
        dispatch({ type: 'select', index: (current.selected + 9) % 81 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const verdict = bad[state.selected]
    ? 'Conflict'
    : value
      ? given
        ? 'Given'
        : 'Placed'
      : openDigits.length === 1
        ? 'Single'
        : 'Open'

  const counts = Array.from({ length: 10 }, () => 0)
  for (const digit of grid) if (digit) counts[digit] = (counts[digit] ?? 0) + 1

  return (
    <div className="sudo">
      <h1 className="sr-only">Sudoku</h1>
      <header className="sudo-top">
        <div className="sudo-brand">
          <a className="sudo-mark" href="./">
            SUDOKU
          </a>
          <p>One solution</p>
        </div>
        <div className="sudo-switch" role="tablist" aria-label="Difficulty">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              role="tab"
              aria-selected={level === state.puzzle.difficulty}
              className={level === state.puzzle.difficulty ? 'is-on' : undefined}
              onClick={() => dispatch({ type: 'deal', difficulty: level, seed: randomSeed() })}
            >
              {level[0]!.toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
        <div className="sudo-top-actions">
          <button
            type="button"
            className="sudo-btn primary"
            onClick={() => dispatch({ type: 'deal', difficulty: state.puzzle.difficulty, seed: randomSeed() })}
          >
            New puzzle
          </button>
          <a className="sudo-btn" href="https://albert-braun.github.io/CV/#work">
            Portfolio
          </a>
        </div>
      </header>
      <div className="sudo-status">
        <span>
          <strong>{state.puzzle.clues}</strong> clues
        </span>
        <span>
          Target <strong>{CLUES[state.puzzle.difficulty]}</strong>
        </span>
        <span>
          Seed <strong>{state.puzzle.seed}</strong>
        </span>
        <span>
          <strong>{state.puzzle.rejected}</strong> removals restored
        </span>
        <button type="button" className="sudo-btn" onClick={() => dispatch({ type: 'candidates' })}>
          {state.showCandidates ? 'Candidates on' : 'Show candidates'}
        </button>
      </div>
      <div className="sudo-shell">
        <div className="sudo-stage">
          {won ? (
            <div className="sudo-banner">
              <p>Solved.</p>
              <button
                type="button"
                className="sudo-btn primary"
                onClick={() => dispatch({ type: 'deal', difficulty: state.puzzle.difficulty, seed: randomSeed() })}
              >
                New puzzle
              </button>
            </div>
          ) : null}
          <div className="sudo-board" role="grid" aria-label="Sudoku">
            {grid.map((digit, index) => {
              const isGiven = state.puzzle.puzzle[index] !== 0 && (state.mode === 'play' || digit === state.puzzle.puzzle[index])
              const classes = [
                'sudo-cell',
                index === state.selected ? 'is-selected' : '',
                peers.has(index) ? 'is-peer' : '',
                bad[index] ? 'is-conflict' : '',
                isGiven ? 'is-given' : '',
                digit && !isGiven ? 'is-entry' : '',
                digit && digit === value && index !== state.selected ? 'is-same' : '',
                colOf(index) % 3 === 2 && colOf(index) !== 8 ? 'is-edge-right' : '',
                rowOf(index) % 3 === 2 && rowOf(index) !== 8 ? 'is-edge-bottom' : '',
              ]
                .filter(Boolean)
                .join(' ')
              const labelDigit = digit || 'empty'
              return (
                <button
                  key={index}
                  type="button"
                  role="gridcell"
                  className={classes}
                  aria-selected={index === state.selected}
                  aria-label={`${cellName(index)}, ${labelDigit}${bad[index] ? ', conflict' : ''}`}
                  onClick={() => dispatch({ type: 'select', index })}
                >
                  {digit ? (
                    digit
                  ) : state.showCandidates ? (
                    <span className="sudo-cands">{candidates(grid, index).join(' ')}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="sudo-pad">
            {Array.from({ length: 9 }, (_, offset) => offset + 1).map((digit) => (
              <button
                key={digit}
                type="button"
                className={counts[digit] === 9 ? 'sudo-key is-full' : 'sudo-key'}
                onClick={() => dispatch({ type: 'place', digit })}
              >
                {digit}
              </button>
            ))}
            <button type="button" className="sudo-key wide" onClick={() => dispatch({ type: 'place', digit: 0 })}>
              Erase
            </button>
          </div>
        </div>
        <aside className="sudo-panel">
          <p className="sudo-kicker">Cell check</p>
          <h2 className={bad[state.selected] ? 'is-conflict' : 'is-open'}>{verdict}</h2>
          <p className="sudo-meta">
            {cellName(state.selected)} · box {Math.floor(rowOf(state.selected) / 3) * 3 + Math.floor(colOf(state.selected) / 3) + 1}
            <br />
            {value ? `Digit ${value}` : `${openDigits.length} digits still open`}
          </p>
          <div className="sudo-digits">
            {Array.from({ length: 9 }, (_, offset) => offset + 1).map((digit) => {
              const probe = grid.slice()
              probe[state.selected] = 0
              const blocks = blocksFor(probe, state.selected, digit)
              const open = blocks.length === 0
              const reason = blocks[0] ? `${blocks[0].unit} ${cellName(blocks[0].index)}` : 'open'
              const classes = [open ? 'is-open' : 'is-blocked', digit === value ? 'is-focus' : '']
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={digit}
                  type="button"
                  className={classes}
                  onClick={() => dispatch({ type: 'place', digit })}
                >
                  <strong>{digit}</strong>
                  <span>{reason}</span>
                </button>
              )
            })}
          </div>
          <p className="sudo-live" aria-live="polite">
            {state.notice ?? (bad[state.selected] ? 'This digit is repeated in a peer cell.' : '')}
          </p>
          <div className="sudo-actions">
            <button type="button" className="sudo-btn" onClick={() => dispatch({ type: 'undo' })} disabled={state.history.length === 0 || state.mode !== 'play'}>
              Undo
            </button>
            <button type="button" className="sudo-btn" onClick={() => dispatch({ type: 'hint' })} disabled={state.mode !== 'play' || won}>
              Hint
            </button>
            {state.mode === 'play' ? (
              <button type="button" className="sudo-btn" onClick={() => dispatch({ type: 'enter-proof' })}>
                Play the proof
              </button>
            ) : (
              <>
                <button type="button" className="sudo-btn" onClick={() => dispatch({ type: 'proof-step', step: state.proofStep - 1 })}>
                  Back
                </button>
                <button
                  type="button"
                  className="sudo-btn"
                  onClick={() => dispatch({ type: 'proof-step', step: state.proofStep + 1 })}
                  disabled={state.proofStep >= state.puzzle.steps.length}
                >
                  Step
                </button>
                <button
                  type="button"
                  className="sudo-btn"
                  onClick={() => dispatch({ type: 'proof-play', value: !state.proofPlaying })}
                  disabled={state.proofStep >= state.puzzle.steps.length}
                >
                  {state.proofPlaying ? 'Pause' : 'Run'}
                </button>
                <button type="button" className="sudo-btn" onClick={() => dispatch({ type: 'exit-proof' })}>
                  Return
                </button>
              </>
            )}
          </div>
          <section className="sudo-proof">
            <p className="sudo-kicker">How the puzzle is made</p>
            <p className="sudo-note">
              A full grid is filled by trying digits in a random order and skipping any that already sit in the same
              row, column, or box. Cells are then cleared one by one. A cell stays empty only when the board still has
              exactly one solution. This puzzle kept {state.puzzle.clues} clues and restored {state.puzzle.rejected}{' '}
              removals.
            </p>
          </section>
          <p className="sudo-keys">Arrows move · 1–9 place · 0 erase · Z undo · H hint · N new puzzle</p>
        </aside>
      </div>
    </div>
  )
}
