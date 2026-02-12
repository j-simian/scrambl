# Plan: Migrate from localStorage to IndexedDB

## Motivation

localStorage is synchronous and limited to ~5-10MB. IndexedDB is async (non-blocking), supports structured data natively (no JSON.stringify/parse), and allows hundreds of MB of storage. For a timer app that accumulates solve history over time, IndexedDB is a better long-term fit.

## Current State

**2 files** with localStorage usage, **14 storage functions**, **5 key patterns**:

| Key Pattern | Data | File |
|---|---|---|
| `cubetimer-solves-{eventId}` | `SolveTime[]` | `App.tsx` |
| `scrambl-custom-algsets` | `AlgSet[]` | `AlgPractice.tsx` |
| `scrambl-alg-times-{caseId}` | `SolveTime[]` | `AlgPractice.tsx` |
| `scrambl-alg-sections-{setId}` | `AlgSetSection[]` | `AlgPractice.tsx` |
| `scrambl-set-sections` | `SetSection[]` | `AlgPractice.tsx` |

Current patterns use **synchronous** lazy `useState` initialization (e.g. `useState(() => loadTimes(...))`), which will need to change to async loading with `useEffect`.

## Approach

### 1. Add the `idb` library

Use the [`idb`](https://github.com/jakearchibald/idb) package — a tiny (~1KB gzipped) promise-based wrapper around the raw IndexedDB API. Raw IndexedDB is callback-based and verbose; `idb` makes it ergonomic without meaningful bundle cost.

```
npm install idb
```

### 2. Create `src/db.ts` — storage abstraction layer

Single module that owns the database connection and exposes typed async functions. Database name: `scrambl-db`, version `1`.

**Object stores:**

| Store | Key | Description |
|---|---|---|
| `solves` | `[eventId, id]` (compound) | Timer solve times, indexed by `eventId` |
| `algSets` | `id` | Custom algorithm sets |
| `algTimes` | `[caseId, id]` (compound) | Algorithm practice solve times, indexed by `caseId` |
| `algSections` | `setId` | Per-set case sections |
| `setSections` | `id` | Top-level set organization sections |

**Exported functions** (all async, replacing current localStorage wrappers):

```ts
// Timer solves
loadTimerSolves(eventId: string): Promise<SolveTime[]>
saveTimerSolves(eventId: string, solves: SolveTime[]): Promise<void>

// Algorithm sets
loadAlgSets(): Promise<AlgSet[]>
saveAlgSets(sets: AlgSet[]): Promise<void>

// Algorithm case times
loadAlgTimes(caseId: string): Promise<SolveTime[]>
saveAlgTimes(caseId: string, times: SolveTime[]): Promise<void>

// Algorithm case sections
loadAlgSections(setId: string): Promise<AlgSetSection[]>
saveAlgSections(setId: string, sections: AlgSetSection[]): Promise<void>

// Set sections (top-level organization)
loadSetSections(): Promise<SetSection[]>
saveSetSections(sections: SetSection[]): Promise<void>
```

### 3. Migrate localStorage data on first load

Inside the `idb` `upgrade` callback (or on first database open), check if localStorage contains existing data. If so, copy it into IndexedDB stores, then clear the localStorage keys. This ensures existing users don't lose their data.

```ts
async function migrateFromLocalStorage(db): Promise<void> {
  // For each key pattern, read from localStorage, write to IndexedDB, then remove
}
```

This runs once — subsequent loads skip the migration since localStorage keys are removed.

### 4. Update `App.tsx` — async loading pattern

**Before:**
```ts
const [solves, setSolves] = useState<SolveTime[]>(() => loadTimes(DEFAULT_EVENT.id))
```

**After:**
```ts
const [solves, setSolves] = useState<SolveTime[]>([])
const [loading, setLoading] = useState(true)

useEffect(() => {
  loadTimerSolves(currentEvent.id).then(data => {
    setSolves(data)
    setLoading(false)
  })
}, [currentEvent.id])
```

Changes needed in `App.tsx`:
- Remove `migrateOldData()`, `loadTimes()`, `saveTimes()`, `storageKey()` — replaced by `db.ts`
- Add loading state; show nothing (or a minimal placeholder) while data loads
- Make `saveTimes` calls fire-and-forget (call the async function without awaiting — writes are non-critical for UI responsiveness)
- Update `switchEvent` to async-load solves instead of sync

### 5. Update `AlgPractice.tsx` — async loading pattern

Same pattern as App.tsx. Changes needed:
- Remove all 8 localStorage load/save functions and key constants
- Import from `db.ts` instead
- Change `useState(initSets)` to `useState<AlgSet[]>([])` + `useEffect` to load
- Change `useState<SetSection[]>(loadSetSections)` similarly
- All save calls become fire-and-forget async calls
- `loadSections(set)` in `openSet()` becomes async
- `loadTimes(caseId)` in practice mode becomes async
- Add loading states where needed

### 6. Move shared types to `src/types.ts`

The `SolveTime` interface is currently duplicated in both `App.tsx` and `AlgPractice.tsx` (with slightly different shapes — App has `penalty`, AlgPractice does not). Extract to a shared file so `db.ts` can import them.

Also move `SetSection` (currently only in `AlgPractice.tsx`) since `db.ts` needs it.

## File changes summary

| File | Action |
|---|---|
| `src/db.ts` | **New** — IndexedDB abstraction + migration |
| `src/types.ts` | **New** — shared type definitions |
| `src/App.tsx` | **Edit** — remove localStorage code, use async db functions, add loading state |
| `src/AlgPractice.tsx` | **Edit** — remove localStorage code, use async db functions, add loading state |
| `package.json` | **Edit** — add `idb` dependency |

## Risks & considerations

- **Loading flash**: First render will show empty state briefly while IndexedDB loads. This is fast (typically <10ms for small data) but worth handling with a loading state to avoid a flicker of "no solves."
- **Error handling**: IndexedDB can fail (private browsing in some browsers, storage quota). The db functions should catch errors and fall back to empty data, matching the current try/catch pattern.
- **Fire-and-forget writes**: Saves don't need to block the UI. If a write fails, the data is still in React state and will be retried on the next save. This matches the current localStorage behavior where write failures are silently ignored.
- **Migration is one-way**: Once data moves from localStorage to IndexedDB, the localStorage keys are deleted. This is fine since we're not supporting rollback.
