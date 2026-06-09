# Translation History Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a docked, per-action, resizable translation-history sidebar to the Tauri desktop translator window, with a 3-state position (left / right / hidden) that auto-resizes the window, plus a "pop out to window" action — reusing the existing history data, list UI, and restore path.

**Architecture:** All *decisions* (position cycle, width clamping, target-window-width math, per-action query scope, layout offsets) are extracted into one pure module (`src/common/history-sidebar.ts`) and unit-tested with vitest — because this repo only does logic-level tests, not React rendering tests. The React/Tauri *glue* (rendering the sidebar column, resizing the OS window, dragging the divider, opening the detached window) consumes those pure functions and is verified manually in `pnpm dev-tauri`. Two new persisted settings fields (`sidebarPosition`, `sidebarWidth`) are added by mirroring the existing `sourceLanguageLocked` / `pinnedSourceLanguage` pattern.

**Tech Stack:** TypeScript, React, `baseui-sd`, `react-jss`, Dexie (`dexie-react-hooks`), Tauri v2 JS API (`@tauri-apps/api/webviewWindow`, `/window`, `/dpi`), vitest.

**Spec:** `docs/atelier/specs/C_translation_history_sidebar.md` (FR-1 … FR-21).

---

## File Structure

**Create**
- `src/common/history-sidebar.ts` — pure helpers + constants + `SidebarPosition` type. Zero runtime imports (types only), so it is safe to import from both `types.ts` and `utils.ts` without cycles. (Tasks 1)
- `src/common/__tests__/history-sidebar.test.ts` — unit tests for the pure helpers. (Task 1)
- `src/common/__tests__/settings-history-sidebar.test.ts` — unit tests for the new settings defaults/clamping. (Task 2)
- `src/common/hooks/useSidebarWindowWidth.ts` — Tauri window-width manager hook (glue). (Task 4)

**Modify**
- `src/common/types.ts` — add `sidebarPosition` + `sidebarWidth` to `ISettings`. (Task 2)
- `src/common/utils.ts` — register both keys in `settingKeys`; add defaults + clamping in `getSettings`. (Task 2)
- `src/common/components/TranslationHistory.tsx` — add `variant='sidebar'`, per-action lock props, `onDetach`, and window-initial-scope props; extract the list JSX so it is reused. (Task 3)
- `src/common/components/Translator.tsx` — read sidebar settings, render the sidebar column + layout offsets, cycle the footer button, drag-to-resize, detach. (Tasks 5–9)
- `src/tauri/windows/HistoryWindow.tsx` — read the handed-off action scope and seed the window's filter. (Task 9)
- `src/common/i18n/locales/en/translation.json`, `src/common/i18n/locales/zh-Hans/translation.json` — add `"Open in separate window"`. (Task 10)

---

## Task 1: Pure helpers module (`history-sidebar.ts`)

**Files:**
- Create: `src/common/history-sidebar.ts`
- Test: `src/common/__tests__/history-sidebar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/common/__tests__/history-sidebar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
    SIDEBAR_DEFAULT_WIDTH,
    SIDEBAR_MIN_WIDTH,
    SIDEBAR_MAX_WIDTH,
    MIN_WINDOW_WIDTH,
    nextSidebarPosition,
    clampSidebarWidth,
    windowWidthOnShow,
    windowWidthOnHide,
    windowWidthOnResize,
    sidebarActionScope,
    sidebarLayoutOffsets,
} from '../history-sidebar'

describe('nextSidebarPosition: cycles left -> right -> hidden -> left', () => {
    it('advances through the cycle', () => {
        expect(nextSidebarPosition('left')).toBe('right')
        expect(nextSidebarPosition('right')).toBe('hidden')
        expect(nextSidebarPosition('hidden')).toBe('left')
    })
    it('falls back to left for an unknown value', () => {
        // @ts-expect-error testing a bad runtime value
        expect(nextSidebarPosition('bogus')).toBe('left')
    })
})

describe('clampSidebarWidth', () => {
    it('keeps an in-range value (rounded)', () => {
        expect(clampSidebarWidth(321.6)).toBe(322)
    })
    it('clamps below the minimum', () => {
        expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN_WIDTH)
    })
    it('clamps above the maximum', () => {
        expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH)
    })
    it('returns the default for a non-finite value', () => {
        expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH)
    })
})

describe('window width math', () => {
    it('grows by the sidebar width on show, capped at the screen', () => {
        expect(windowWidthOnShow(620, 320, 4000)).toBe(940)
        expect(windowWidthOnShow(620, 320, 800)).toBe(800) // screen-bound: translation narrows
    })
    it('restores the recorded base width on hide when known', () => {
        expect(windowWidthOnHide(940, 320, 620)).toBe(620)
    })
    it('shrinks by the sidebar width on hide when no base is recorded', () => {
        expect(windowWidthOnHide(940, 320, null)).toBe(620)
        expect(windowWidthOnHide(560, 320, null)).toBe(MIN_WINDOW_WIDTH) // never below min window
    })
    it('applies a signed delta on resize, clamped to [min, screen]', () => {
        expect(windowWidthOnResize(940, 60, 4000)).toBe(1000)
        expect(windowWidthOnResize(940, -9999, 4000)).toBe(MIN_WINDOW_WIDTH)
        expect(windowWidthOnResize(940, 9999, 1000)).toBe(1000)
    })
})

describe('sidebarActionScope: isolate history per action', () => {
    it('scopes by numeric id when present', () => {
        expect(sidebarActionScope({ id: 7, mode: 'translate' } as never)).toEqual({ actionId: 7 })
    })
    it('scopes by mode when there is no numeric id', () => {
        expect(sidebarActionScope({ mode: 'polishing' } as never)).toEqual({ actionMode: 'polishing' })
    })
    it('returns an empty scope for no action', () => {
        expect(sidebarActionScope(undefined)).toEqual({})
    })
})

describe('sidebarLayoutOffsets', () => {
    it('insets content + bars on the left', () => {
        expect(sidebarLayoutOffsets('left', 320)).toEqual({
            contentPaddingLeft: 320,
            contentPaddingRight: 0,
            barLeft: 320,
            barRight: 0,
        })
    })
    it('insets content + bars on the right', () => {
        expect(sidebarLayoutOffsets('right', 300)).toEqual({
            contentPaddingLeft: 0,
            contentPaddingRight: 300,
            barLeft: 0,
            barRight: 300,
        })
    })
    it('is a no-op when hidden', () => {
        expect(sidebarLayoutOffsets('hidden', 320)).toEqual({
            contentPaddingLeft: 0,
            contentPaddingRight: 0,
            barLeft: undefined,
            barRight: undefined,
        })
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run history-sidebar`
Expected: FAIL — `Failed to resolve import "../history-sidebar"` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/common/history-sidebar.ts`:

```ts
import type { Action } from './internal-services/db'
import type { TranslateMode } from './translate'

export type SidebarPosition = 'left' | 'right' | 'hidden'

export const SIDEBAR_DEFAULT_WIDTH = 320
export const SIDEBAR_MIN_WIDTH = 240
export const SIDEBAR_MAX_WIDTH = 560

// Mirrors the Tauri translator window's min_inner_size width (src-tauri/src/windows.rs).
export const MIN_WINDOW_WIDTH = 540

const POSITION_CYCLE: SidebarPosition[] = ['left', 'right', 'hidden']

// FR-2: one button cycles left -> right -> hidden -> left.
export function nextSidebarPosition(current: SidebarPosition): SidebarPosition {
    const idx = POSITION_CYCLE.indexOf(current)
    if (idx === -1) {
        return 'left'
    }
    return POSITION_CYCLE[(idx + 1) % POSITION_CYCLE.length]
}

// FR-9: persisted width is always kept inside [min, max]; bad values fall back to default.
export function clampSidebarWidth(width: number): number {
    if (!Number.isFinite(width)) {
        return SIDEBAR_DEFAULT_WIDTH
    }
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
}

// FR-6 / FR-8: showing the sidebar grows the window by the sidebar width, but never past
// the screen's available width (when it would, the translation area narrows instead).
export function windowWidthOnShow(currentWidth: number, sidebarWidth: number, screenAvailWidth: number): number {
    return Math.min(currentWidth + sidebarWidth, screenAvailWidth)
}

// FR-6: hiding restores the recorded base width if we have one, otherwise shrinks by the
// sidebar width (never below the minimum window width).
export function windowWidthOnHide(currentWidth: number, sidebarWidth: number, baseWidth: number | null): number {
    if (baseWidth != null) {
        return baseWidth
    }
    return Math.max(MIN_WINDOW_WIDTH, currentWidth - sidebarWidth)
}

// FR-10: dragging the divider moves the window width by the same signed delta, clamped.
export function windowWidthOnResize(currentWidth: number, deltaWidth: number, screenAvailWidth: number): number {
    return Math.min(Math.max(MIN_WINDOW_WIDTH, currentWidth + deltaWidth), screenAvailWidth)
}

// FR-11: scope the history list to a single action. Built-in actions have a numeric id too,
// so id wins when present (matches handleHistoryRestore + the existing action filter); fall
// back to mode for actions that only carry a mode.
export function sidebarActionScope(action: Action | undefined): { actionId?: number; actionMode?: TranslateMode } {
    if (!action) {
        return {}
    }
    if (typeof action.id === 'number') {
        return { actionId: action.id }
    }
    if (action.mode) {
        return { actionMode: action.mode }
    }
    return {}
}

// FR-3: the fixed header/footer are width:100%; inset them and the scrolling content so the
// fixed sidebar column does not overlap them.
export function sidebarLayoutOffsets(
    position: SidebarPosition,
    width: number
): { contentPaddingLeft: number; contentPaddingRight: number; barLeft: number | undefined; barRight: number | undefined } {
    if (position === 'left') {
        return { contentPaddingLeft: width, contentPaddingRight: 0, barLeft: width, barRight: 0 }
    }
    if (position === 'right') {
        return { contentPaddingLeft: 0, contentPaddingRight: width, barLeft: 0, barRight: width }
    }
    return { contentPaddingLeft: 0, contentPaddingRight: 0, barLeft: undefined, barRight: undefined }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run history-sidebar`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/common/history-sidebar.ts src/common/__tests__/history-sidebar.test.ts
git commit -m "feat(history): add pure helpers for sidebar position, width and scope"
```

---

## Task 2: Persist `sidebarPosition` + `sidebarWidth` in settings

**Files:**
- Modify: `src/common/types.ts:83` (inside `ISettings`)
- Modify: `src/common/utils.ts:71` (in `settingKeys`) and `src/common/utils.ts:180` (in `getSettings`)
- Test: `src/common/__tests__/settings-history-sidebar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/common/__tests__/settings-history-sidebar.test.ts` (the polyfill mock mirrors `settings-lang-lock.test.ts` so `getSettings()` reads from an in-memory store):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

interface FakeStore {
    [key: string]: unknown
}

const fakeStore: FakeStore = {}

vi.mock('webextension-polyfill', () => {
    return {
        default: {
            storage: {
                sync: {
                    get: async (keys: string[]) =>
                        keys.reduce<Record<string, unknown>>((acc, k) => {
                            acc[k] = fakeStore[k]
                            return acc
                        }, {}),
                    set: async (items: Record<string, unknown>) => {
                        Object.assign(fakeStore, items)
                    },
                    remove: async (keys: string[]) => {
                        for (const k of keys) delete fakeStore[k]
                    },
                },
            },
            runtime: {
                onMessage: { addListener: () => {}, removeListener: () => {} },
            },
        },
    }
})

import { getSettings } from '../utils'
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from '../history-sidebar'

function resetStore(seed: FakeStore = {}) {
    for (const k of Object.keys(fakeStore)) delete fakeStore[k]
    Object.assign(fakeStore, seed)
}

describe('settings: history sidebar defaults & clamping', () => {
    beforeEach(() => {
        resetStore()
    })

    it('defaults position to left and width to the default when empty (FR-1)', async () => {
        const settings = await getSettings()
        expect(settings.sidebarPosition).toBe('left')
        expect(settings.sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
    })

    it('keeps a valid stored position and width', async () => {
        resetStore({ sidebarPosition: 'right', sidebarWidth: 400 })
        const settings = await getSettings()
        expect(settings.sidebarPosition).toBe('right')
        expect(settings.sidebarWidth).toBe(400)
    })

    it('resets an invalid position to left', async () => {
        resetStore({ sidebarPosition: 'sideways' })
        const settings = await getSettings()
        expect(settings.sidebarPosition).toBe('left')
    })

    it('clamps an out-of-range width', async () => {
        resetStore({ sidebarWidth: 10 })
        expect((await getSettings()).sidebarWidth).toBe(SIDEBAR_MIN_WIDTH)
        resetStore({ sidebarWidth: 9999 })
        expect((await getSettings()).sidebarWidth).toBe(SIDEBAR_MAX_WIDTH)
    })

    it('falls back to the default width for a non-number', async () => {
        resetStore({ sidebarWidth: 'wide' })
        expect((await getSettings()).sidebarWidth).toBe(SIDEBAR_DEFAULT_WIDTH)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run settings-history-sidebar`
Expected: FAIL — `expect(settings.sidebarPosition).toBe('left')` receives `undefined` (field not yet added).

- [ ] **Step 3a: Add the fields to `ISettings`**

In `src/common/types.ts`, add the import near the other local imports (after line 5 `import { LangCode } from './lang'`):

```ts
import type { SidebarPosition } from './history-sidebar'
```

Then add the two fields immediately after `pinnedTargetLanguage?: LangCode` (line 83):

```ts
    pinnedTargetLanguage?: LangCode
    sidebarPosition: SidebarPosition
    sidebarWidth: number
```

- [ ] **Step 3b: Register the keys in `settingKeys`**

In `src/common/utils.ts`, add the keys right after `pinnedTargetLanguage: 1,` (line 71):

```ts
    pinnedTargetLanguage: 1,
    sidebarPosition: 1,
    sidebarWidth: 1,
```

- [ ] **Step 3c: Add defaults + clamping in `getSettings`**

In `src/common/utils.ts`, add the import near the top imports (after line 10 `import { LANG_CONFIGS } from './lang/data'`):

```ts
import { SIDEBAR_DEFAULT_WIDTH, clampSidebarWidth } from './history-sidebar'
```

Then insert this block right after the language-lock normalization (immediately after line 180, the `settings.targetLanguageLocked = false` closing block):

```ts
    if (settings.sidebarPosition !== 'left' && settings.sidebarPosition !== 'right' && settings.sidebarPosition !== 'hidden') {
        settings.sidebarPosition = 'left'
    }
    if (typeof settings.sidebarWidth !== 'number' || !Number.isFinite(settings.sidebarWidth)) {
        settings.sidebarWidth = SIDEBAR_DEFAULT_WIDTH
    } else {
        settings.sidebarWidth = clampSidebarWidth(settings.sidebarWidth)
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run settings-history-sidebar`
Expected: PASS.

Then run the full suite to make sure nothing else broke:
Run: `pnpm exec vitest run`
Expected: PASS (all existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/common/types.ts src/common/utils.ts src/common/__tests__/settings-history-sidebar.test.ts
git commit -m "feat(history): persist sidebar position and width in settings"
```

---

## Task 3: Add a `sidebar` variant to `TranslationHistory`

This makes the existing history component renderable as a docked column: scoped to one action (no action selector), with a "pop out" button, reusing the existing item list. It also adds an optional initial-scope seed used later by the detached window (Task 9).

**Files:**
- Modify: `src/common/components/TranslationHistory.tsx`

- [ ] **Step 1: Extend the props**

Replace the `TranslationHistoryProps` interface (lines 22–29) with:

```tsx
interface TranslationHistoryProps {
    isOpen: boolean
    actions: Action[]
    activeActionId?: number
    onClose: () => void
    onRestore: (item: HistoryItem) => void
    variant?: 'modal' | 'window' | 'sidebar'
    // Sidebar variant: lock the list to a single action ("page") and hide the action selector.
    lockedActionId?: number
    lockedActionMode?: TranslateMode
    // Sidebar variant: show a "pop out to window" button in the header.
    onDetach?: () => void
    // Window variant: seed the action filter when the window is opened from a scoped sidebar.
    initialActionId?: number
    initialActionMode?: TranslateMode
}
```

Add the `TranslateMode` type import near the top (after line 10 `import { HistoryItem, Action } from '../internal-services/db'`):

```tsx
import type { TranslateMode } from '../translate'
```

Add the detach icon to the existing `react-icons/md` import (line 16 is `react-icons/md` for `MdReplay`):

```tsx
import { MdReplay } from 'react-icons/md'
import { MdOpenInNew } from 'react-icons/md'
```

- [ ] **Step 2: Add sidebar styles**

In the `useStyles` object (ends at line 136 with the `windowBody` block), add three entries before the closing `})`:

```tsx
    sidebarRoot: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        gap: '12px',
        padding: '14px 12px 12px 12px',
        minWidth: 0,
    },
    sidebarHeader: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
    },
    sidebarTitle: {
        fontSize: '15px',
        fontWeight: 600,
    },
```

- [ ] **Step 3: Compute variant flags + scoped query**

Replace line 159 (`const isModal = variant !== 'window'`) with:

```tsx
    const isModal = variant === 'modal'
    const isSidebar = variant === 'sidebar'
```

Seed the selected action from `initialActionId/initialActionMode` for the window variant. Replace line 169:

```tsx
    const [selectedActionId, setSelectedActionId] = useState<string | number>(
        props.initialActionId ?? props.initialActionMode ?? ALL_ACTIONS_OPTION_ID
    )
```

Replace the `useLiveQuery` call (lines 231–251) with a version that uses the locked scope when in sidebar mode:

```tsx
    const historyItems = useLiveQuery(
        () => {
            if (!isActive) {
                return []
            }
            const scopedActionId = isSidebar
                ? props.lockedActionId
                : selectedActionId === ALL_ACTIONS_OPTION_ID
                ? undefined
                : typeof selectedActionData?.id === 'number'
                ? selectedActionData.id
                : undefined
            const scopedActionMode = isSidebar
                ? props.lockedActionId === undefined
                    ? props.lockedActionMode
                    : undefined
                : selectedActionId === ALL_ACTIONS_OPTION_ID
                ? undefined
                : selectedActionData?.mode
            return historyService.list({
                search,
                favoritesOnly,
                limit: 200,
                actionId: scopedActionId,
                actionMode: scopedActionMode,
            })
        },
        [
            isActive,
            isSidebar,
            search,
            favoritesOnly,
            selectedActionId,
            selectedActionData?.id,
            selectedActionData?.mode,
            props.lockedActionId,
            props.lockedActionMode,
        ],
        []
    )
```

- [ ] **Step 4: Let `renderControls` hide the action selector**

Replace the `renderControls` definition (lines 304–329) with one that can omit the `Select` and accept a grid override:

```tsx
    const renderControls = (styleOverride?: React.CSSProperties, options?: { hideActionSelect?: boolean }) => (
        <div className={styles.controls} style={styleOverride} data-tauri-drag-ignore='true'>
            <Input
                inputRef={searchInputRef}
                value={search}
                clearable
                placeholder={t('Search History')}
                size='compact'
                onChange={(e) => setSearch(e.currentTarget.value)}
                onClear={() => setSearch('')}
            />
            {!options?.hideActionSelect && (
                <Select
                    size='compact'
                    clearable={false}
                    options={actionsOptions}
                    value={selectValue}
                    onChange={({ value }) => {
                        const nextId = (value[0]?.id ?? ALL_ACTIONS_OPTION_ID) as string | number
                        setSelectedActionId((current) => (current === nextId ? current : nextId))
                    }}
                />
            )}
            <Checkbox checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.currentTarget.checked)}>
                {t('Favorites Only')}
            </Checkbox>
        </div>
    )
```

- [ ] **Step 5: Extract the list JSX so both layouts reuse it**

Right now the scrolling list lives inside `bodyContent` as the block:

```tsx
<div className={styles.historyList} style={{ flex: isModal ? undefined : 1 }}>
    … item-mapping JSX … (currently lines ~343–520)
</div>
```

Lift it into a named node declared **above** the `bodyContent` declaration (i.e., just before line 331 `const bodyContent = (`):

```tsx
    const historyListNode = (
        <div
            className={styles.historyList}
            style={{
                flex: isModal ? undefined : 1,
            }}
        >
            {/* MOVE verbatim: the existing children of `styles.historyList`
                (the `isActive && historyItems?.length > 0 ? historyItems.map(...) : isActive ? <empty/> : null`
                block currently at lines ~349–519). Do not change their contents. */}
        </div>
    )
```

Then, inside `bodyContent`, replace the original `<div className={styles.historyList}>…</div>` block with:

```tsx
            {historyListNode}
```

Run `pnpm lint` after this move to confirm the JSX still balances before continuing.

- [ ] **Step 6: Render the sidebar branch**

Add this block immediately before the existing `if (!isModal) {` window branch (currently line 537):

```tsx
    if (isSidebar) {
        return (
            <div
                className={styles.sidebarRoot}
                style={{
                    background: theme.colors.backgroundPrimary,
                    color: theme.colors.contentPrimary,
                }}
            >
                <div className={styles.sidebarHeader}>
                    <div className={styles.sidebarTitle}>{headerTitle}</div>
                    {props.onDetach && (
                        <Tooltip content={t('Open in separate window')} placement='bottom'>
                            <Button
                                size='mini'
                                kind='tertiary'
                                onClick={() => props.onDetach?.()}
                                overrides={{
                                    BaseButton: { style: { paddingLeft: '6px', paddingRight: '6px' } },
                                }}
                            >
                                <MdOpenInNew size={16} />
                            </Button>
                        </Tooltip>
                    )}
                </div>
                {renderControls({ gridTemplateColumns: '1fr auto' }, { hideActionSelect: true })}
                {historyListNode}
            </div>
        )
    }
```

- [ ] **Step 7: Verify it type-checks and lints**

Run: `pnpm exec tsc --noEmit`
Expected: no errors related to `TranslationHistory.tsx`.

Run: `pnpm lint`
Expected: no new lint errors.

- [ ] **Step 8: Commit**

```bash
git add src/common/components/TranslationHistory.tsx
git commit -m "feat(history): add docked sidebar variant to TranslationHistory"
```

---

## Task 4: Tauri window-width manager hook

**Files:**
- Create: `src/common/hooks/useSidebarWindowWidth.ts`

> No unit test: this is pure Tauri I/O glue around the already-tested pure math from Task 1. It is exercised in the manual verification (Task 11).

- [ ] **Step 1: Create the hook**

Create `src/common/hooks/useSidebarWindowWidth.ts`:

```ts
import { useCallback, useRef } from 'react'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { currentMonitor } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { windowWidthOnShow, windowWidthOnHide, windowWidthOnResize } from '../history-sidebar'

// Manages the translator window's width as the sidebar is shown / hidden / resized.
// All numeric decisions come from the unit-tested helpers in ../history-sidebar.
export function useSidebarWindowWidth() {
    // The window width to restore to when the sidebar is hidden. Null when the sidebar
    // is not currently responsible for any extra width (e.g. right after a hide, or on
    // a fresh launch where the OS-restored window already includes the sidebar).
    const baseWidthRef = useRef<number | null>(null)

    const readMetrics = useCallback(async () => {
        const win = WebviewWindow.getCurrent()
        const factor = await win.scaleFactor()
        const logical = (await win.innerSize()).toLogical(factor)
        const monitor = await currentMonitor()
        const screenAvail = monitor ? monitor.size.toLogical(factor).width : Number.POSITIVE_INFINITY
        return { win, factor, width: logical.width, height: logical.height, screenAvail }
    }, [])

    const showSidebar = useCallback(
        async (sidebarWidth: number) => {
            const { win, width, height, screenAvail } = await readMetrics()
            if (baseWidthRef.current == null) {
                baseWidthRef.current = width
            }
            const target = windowWidthOnShow(width, sidebarWidth, screenAvail)
            await win.setSize(new LogicalSize(Math.round(target), Math.round(height)))
        },
        [readMetrics]
    )

    const hideSidebar = useCallback(
        async (sidebarWidth: number) => {
            const { win, width, height } = await readMetrics()
            const target = windowWidthOnHide(width, sidebarWidth, baseWidthRef.current)
            baseWidthRef.current = null
            await win.setSize(new LogicalSize(Math.round(target), Math.round(height)))
        },
        [readMetrics]
    )

    const resizeSidebar = useCallback(
        async (deltaWidth: number) => {
            const { win, width, height, screenAvail } = await readMetrics()
            const target = windowWidthOnResize(width, deltaWidth, screenAvail)
            await win.setSize(new LogicalSize(Math.round(target), Math.round(height)))
        },
        [readMetrics]
    )

    return { showSidebar, hideSidebar, resizeSidebar }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (If `@tauri-apps/api/dpi` is not found, use `import { LogicalSize } from '@tauri-apps/api/window'` instead — both re-export it in v2; pick the one that resolves.)

- [ ] **Step 3: Commit**

```bash
git add src/common/hooks/useSidebarWindowWidth.ts
git commit -m "feat(history): add tauri window width manager for the sidebar"
```

---

## Task 5: Wire sidebar state into the Translator

**Files:**
- Modify: `src/common/components/Translator.tsx`

- [ ] **Step 1: Add imports**

Near the existing imports, add (the `isTauri` import already exists at line 29's import group from `../utils`; only add what is missing):

```tsx
import { nextSidebarPosition, clampSidebarWidth, sidebarActionScope, sidebarLayoutOffsets } from '../history-sidebar'
import { useSidebarWindowWidth } from '../hooks/useSidebarWindowWidth'
```

Confirm `isTauri` is in the `from '../utils'` import list (line ~29 group). If not present there, add `isTauri` to that import list.

- [ ] **Step 2: Derive sidebar state**

Right after the `persistSettingsPatch` definition (ends at line 644), add:

```tsx
    const { showSidebar, hideSidebar, resizeSidebar } = useSidebarWindowWidth()
    // Non-Tauri builds never show the docked sidebar (FR-5); they keep the modal.
    const sidebarPosition = isTauri() ? settings.sidebarPosition : 'hidden'
    const [draftSidebarWidth, setDraftSidebarWidth] = useState(settings.sidebarWidth)
    useEffect(() => {
        setDraftSidebarWidth(settings.sidebarWidth)
    }, [settings.sidebarWidth])
    const sidebarVisible = sidebarPosition === 'left' || sidebarPosition === 'right'
    const sidebarScope = useMemo(() => sidebarActionScope(activateAction), [activateAction])
    const sidebarOffsets = sidebarLayoutOffsets(sidebarVisible ? sidebarPosition : 'hidden', draftSidebarWidth)
```

> `useMemo` and `useEffect` are already imported in this file. `activateAction` is declared later (line 737) — move the `sidebarScope`/`sidebarOffsets` lines to **just after** the `activateAction` declaration if the linter complains about use-before-declaration; keep `showSidebar/hideSidebar/resizeSidebar`, `sidebarPosition`, and `draftSidebarWidth` here.

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (values are declared but some not yet used — that is fine for `const`).

- [ ] **Step 4: Commit**

```bash
git add src/common/components/Translator.tsx
git commit -m "feat(history): derive sidebar state in Translator"
```

---

## Task 6: Make the footer history button cycle the position (Tauri)

**Files:**
- Modify: `src/common/components/Translator.tsx`

- [ ] **Step 1: Add the apply-position handler**

Add this callback near the other Translator callbacks (e.g. right after the `sidebarOffsets` line from Task 5):

```tsx
    const applySidebarPosition = useCallback(
        async (current: typeof sidebarPosition, next: ReturnType<typeof nextSidebarPosition>) => {
            await persistSettingsPatch({ sidebarPosition: next })
            const wasVisible = current === 'left' || current === 'right'
            const willBeVisible = next === 'left' || next === 'right'
            if (!wasVisible && willBeVisible) {
                await showSidebar(draftSidebarWidth) // FR-6: grow the window
            } else if (wasVisible && !willBeVisible) {
                await hideSidebar(draftSidebarWidth) // FR-6: restore the window
            }
            // left <-> right keeps the same total width (FR-7): no resize.
        },
        [persistSettingsPatch, showSidebar, hideSidebar, draftSidebarWidth]
    )
```

- [ ] **Step 2: Change the footer button's onClick**

Replace the footer history button's `onClick` (lines 2937–2946) with:

```tsx
                                    onClick={async (event) => {
                                        event.stopPropagation()
                                        event.preventDefault()
                                        if (isTauri()) {
                                            await applySidebarPosition(
                                                sidebarPosition,
                                                nextSidebarPosition(sidebarPosition)
                                            )
                                            return
                                        }
                                        setIsHistoryOpen(true)
                                    }}
```

- [ ] **Step 3: Type-check + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/common/components/Translator.tsx
git commit -m "feat(history): cycle sidebar position from the footer button"
```

---

## Task 7: Render the sidebar column + offset the layout

**Files:**
- Modify: `src/common/components/Translator.tsx`

- [ ] **Step 1: Offset the fixed header**

The header `<div>` opens at line 1878 with a `style={{ ... }}`. Add the offset entries to that style object (merge with the existing `cursor` / `boxShadow` / `background` keys):

```tsx
                        style={{
                            cursor: isDesktopApp() ? 'default' : showLogo ? 'move' : 'default',
                            boxShadow: isDesktopApp() && !isScrolledToTop ? theme.lighting.shadow600 : undefined,
                            background: settings.enableBackgroundBlur ? 'transparent' : '',
                            left: sidebarVisible ? sidebarOffsets.barLeft : undefined,
                            right: sidebarVisible ? sidebarOffsets.barRight : undefined,
                            width: sidebarVisible ? 'auto' : undefined,
                        }}
```

- [ ] **Step 2: Offset the scrolling content**

The content wrapper `<div style={props.containerStyle}>` is at line 1877. Replace it with a merged style that adds horizontal padding when the sidebar is visible:

```tsx
                <div
                    style={{
                        ...props.containerStyle,
                        paddingLeft: sidebarVisible ? sidebarOffsets.contentPaddingLeft : (props.containerStyle as React.CSSProperties | undefined)?.paddingLeft,
                        paddingRight: sidebarVisible ? sidebarOffsets.contentPaddingRight : (props.containerStyle as React.CSSProperties | undefined)?.paddingRight,
                    }}
                >
```

- [ ] **Step 3: Offset the fixed footer**

The footer `<div className={styles.footer}>` is at line 2830. Give it an inline style (it currently has none). Change the opening tag to:

```tsx
                <div
                    className={styles.footer}
                    style={{
                        left: sidebarVisible ? sidebarOffsets.barLeft : undefined,
                        right: sidebarVisible ? sidebarOffsets.barRight : undefined,
                        width: sidebarVisible ? 'auto' : undefined,
                    }}
```

> Keep any other existing attributes/handlers that were on that `<div>` (e.g. `onClick`/refs). If the original tag had no other props beyond `className`, the snippet above is complete.

- [ ] **Step 4: Render the sidebar column**

Add this just before the `<Toaster />` line (line 3026), so the column is a child of the `popupCard` root:

```tsx
            {sidebarVisible && (
                <aside
                    style={{
                        position: 'fixed',
                        top: 0,
                        bottom: 0,
                        left: sidebarPosition === 'left' ? 0 : undefined,
                        right: sidebarPosition === 'right' ? 0 : undefined,
                        width: draftSidebarWidth,
                        zIndex: 1001,
                        display: 'flex',
                        flexDirection: sidebarPosition === 'left' ? 'row' : 'row-reverse',
                        background: theme.colors.backgroundPrimary,
                        boxShadow:
                            themeType === 'dark'
                                ? '0 0 12px rgba(0,0,0,0.5)'
                                : '0 0 12px rgba(0,0,0,0.12)',
                    }}
                >
                    <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
                        <TranslationHistory
                            variant='sidebar'
                            isOpen
                            actions={actions ?? []}
                            activeActionId={activateAction?.id}
                            lockedActionId={sidebarScope.actionId}
                            lockedActionMode={sidebarScope.actionMode}
                            onClose={() => undefined}
                            onRestore={handleHistoryRestore}
                            onDetach={handleSidebarDetach}
                        />
                    </div>
                    <div
                        role='separator'
                        aria-orientation='vertical'
                        onPointerDown={handleSidebarResizeStart}
                        style={{
                            width: 6,
                            cursor: 'col-resize',
                            flexShrink: 0,
                            background:
                                themeType === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                        }}
                    />
                </aside>
            )}
```

> `handleSidebarDetach` and `handleSidebarResizeStart` are added in Tasks 8 and 9. Add them before this render or the file will not compile — do Tasks 8 and 9 next, then return here to confirm the build. (If you want this task to compile standalone, temporarily stub both as `const handleSidebarDetach = () => undefined` and `const handleSidebarResizeStart = () => undefined`, then replace in Tasks 8–9.)

- [ ] **Step 5: Type-check (after Tasks 8–9 land) + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/common/components/Translator.tsx
git commit -m "feat(history): render docked sidebar column and offset layout"
```

---

## Task 8: Drag-to-resize the sidebar width

**Files:**
- Modify: `src/common/components/Translator.tsx`

- [ ] **Step 1: Add the pointer-drag handler**

Add near the other sidebar callbacks (before the render):

```tsx
    const handleSidebarResizeStart = useCallback(
        (event: React.PointerEvent) => {
            event.preventDefault()
            // Dragging away from the window edge widens the sidebar:
            // left sidebar -> drag right (+x); right sidebar -> drag left (-x).
            const direction = sidebarPosition === 'left' ? 1 : -1
            let lastX = event.clientX
            let latestWidth = draftSidebarWidth
            const onMove = (e: PointerEvent) => {
                const dx = (e.clientX - lastX) * direction
                lastX = e.clientX
                const next = clampSidebarWidth(latestWidth + dx)
                if (next !== latestWidth) {
                    void resizeSidebar(next - latestWidth) // grow/shrink the OS window by the same delta
                    latestWidth = next
                    setDraftSidebarWidth(next)
                }
            }
            const onUp = () => {
                window.removeEventListener('pointermove', onMove)
                window.removeEventListener('pointerup', onUp)
                void persistSettingsPatch({ sidebarWidth: latestWidth }) // FR-9: persist final width
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
        },
        [sidebarPosition, draftSidebarWidth, resizeSidebar, persistSettingsPatch]
    )
```

If you added a temporary stub for `handleSidebarResizeStart` in Task 7, replace it with this real implementation.

- [ ] **Step 2: Type-check + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/common/components/Translator.tsx
git commit -m "feat(history): drag to resize the history sidebar"
```

---

## Task 9: Detach to a standalone window (scoped to the current action)

The detach button opens the existing standalone history window, hands off the current action as its initial filter, then auto-hides the sidebar and restores the window width.

**Files:**
- Modify: `src/common/history-sidebar.ts` (one exported constant)
- Modify: `src/common/components/Translator.tsx`
- Modify: `src/tauri/windows/HistoryWindow.tsx`

- [ ] **Step 1: Export a handoff key**

Add to the end of `src/common/history-sidebar.ts`:

```ts
// localStorage key used to hand the active action's scope to a freshly-opened
// standalone history window (Tauri webviews share localStorage origin). FR-19.
export const HISTORY_WINDOW_SCOPE_KEY = 'history_window_initial_scope'
```

- [ ] **Step 2: Add the detach handler in Translator**

Add the import for the key to the Translator's `../history-sidebar` import (extend the existing import from Task 5):

```tsx
import {
    nextSidebarPosition,
    clampSidebarWidth,
    sidebarActionScope,
    sidebarLayoutOffsets,
    HISTORY_WINDOW_SCOPE_KEY,
} from '../history-sidebar'
```

Add the handler near the other sidebar callbacks:

```tsx
    const handleSidebarDetach = useCallback(async () => {
        // Hand off the current action scope so the window opens pre-filtered (FR-19).
        try {
            localStorage.setItem(HISTORY_WINDOW_SCOPE_KEY, JSON.stringify(sidebarActionScope(activateAction)))
        } catch (error) {
            console.error('Failed to stash history window scope', error)
        }
        const { commands } = await import('@/tauri/bindings')
        await commands.showHistoryWindow()
        // FR-20: auto-hide the docked sidebar and restore the window width.
        if (sidebarPosition === 'left' || sidebarPosition === 'right') {
            await hideSidebar(draftSidebarWidth)
        }
        await persistSettingsPatch({ sidebarPosition: 'hidden' })
    }, [activateAction, sidebarPosition, draftSidebarWidth, hideSidebar, persistSettingsPatch])
```

If you added a temporary stub for `handleSidebarDetach` in Task 7, replace it with this.

- [ ] **Step 3: Read the handoff in HistoryWindow**

Replace `src/tauri/windows/HistoryWindow.tsx` with:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Window } from '../components/Window'
import { TranslationHistory } from '../../common/components/TranslationHistory'
import { useLiveQuery } from 'dexie-react-hooks'
import { actionService } from '../../common/services/action'
import { HistoryItem } from '../../common/internal-services/db'
import { emit } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useMemoWindow } from '../../common/hooks/useMemoWindow'
import { trackEvent } from '@aptabase/tauri'
import { HISTORY_WINDOW_SCOPE_KEY } from '../../common/history-sidebar'

export function HistoryWindow() {
    useMemoWindow({ size: true, position: true, show: true })

    // Read (and clear) the action scope handed off by the sidebar's detach action (FR-19).
    const [initialScope] = useState<{ actionId?: number; actionMode?: HistoryItem['actionMode'] }>(() => {
        try {
            const raw = localStorage.getItem(HISTORY_WINDOW_SCOPE_KEY)
            if (raw) {
                localStorage.removeItem(HISTORY_WINDOW_SCOPE_KEY)
                return JSON.parse(raw)
            }
        } catch (error) {
            console.error('Failed to read history window scope', error)
        }
        return {}
    })

    useEffect(() => {
        trackEvent('screen_view', { name: 'History' })
    }, [])

    const actions = useLiveQuery(() => actionService.list(), [])
    const appWindow = WebviewWindow.getCurrent()

    const handleClose = useCallback(() => {
        void appWindow.close()
    }, [appWindow])

    const handleRestore = useCallback((item: HistoryItem) => {
        void emit('history:restore', item)
    }, [])

    return (
        <Window>
            <TranslationHistory
                variant='window'
                isOpen
                actions={actions ?? []}
                initialActionId={initialScope.actionId}
                initialActionMode={initialScope.actionMode}
                onClose={handleClose}
                onRestore={handleRestore}
            />
        </Window>
    )
}
```

- [ ] **Step 4: Type-check + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors. Confirm Task 7's `<aside>` now compiles (both handlers exist).

- [ ] **Step 5: Commit**

```bash
git add src/common/history-sidebar.ts src/common/components/Translator.tsx src/tauri/windows/HistoryWindow.tsx
git commit -m "feat(history): detach sidebar to a scoped standalone window"
```

---

## Task 10: Add the i18n string

**Files:**
- Modify: `src/common/i18n/locales/en/translation.json`
- Modify: `src/common/i18n/locales/zh-Hans/translation.json`

> All other locales fall back to the English key automatically (i18next default). Only en + zh-Hans are required.

- [ ] **Step 1: Add the English key**

In `src/common/i18n/locales/en/translation.json`, add (alongside the other `"O..."` entries, e.g. after `"Original Text"`):

```json
    "Open in separate window": "Open in separate window",
```

- [ ] **Step 2: Add the Simplified-Chinese key**

In `src/common/i18n/locales/zh-Hans/translation.json`, add:

```json
    "Open in separate window": "在独立窗口中打开",
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "require('./src/common/i18n/locales/en/translation.json'); require('./src/common/i18n/locales/zh-Hans/translation.json'); console.log('ok')"`
Expected: prints `ok` (no JSON parse error / no trailing-comma error).

- [ ] **Step 4: Commit**

```bash
git add src/common/i18n/locales/en/translation.json src/common/i18n/locales/zh-Hans/translation.json
git commit -m "feat(history): add i18n string for sidebar detach"
```

---

## Task 11: Full verification (build + manual)

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite + type-check + lint**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit && pnpm lint`
Expected: all PASS, no type errors, no lint errors.

- [ ] **Step 2: Launch the desktop app**

Run: `pnpm dev-tauri`
Expected: the translator window opens. (Requires the Rust toolchain; first build is slow.)

- [ ] **Step 3: Manual checks against the spec**

Walk through each and confirm:

- [ ] First launch with no prior config: clicking the footer history button once shows the sidebar on the **left** and the window grows wider (FR-1, FR-2, FR-6).
- [ ] Click again → sidebar moves to the **right**, window width unchanged (FR-2, FR-7).
- [ ] Click again → sidebar **hidden**, window width restored to the pre-sidebar width (FR-2, FR-6).
- [ ] With the sidebar open, run a translation in the "Translate" action → the new entry appears at the top of the sidebar. Switch to "Polishing" → the list switches to Polishing history only (FR-9, FR-10, FR-11, FR-12).
- [ ] Click a record in the sidebar → its source text, translation, languages and action load into the editor with **no** re-translation (FR-15, FR-16).
- [ ] Search box and "Favorites only" filter the current action's list; there is **no** action dropdown in the sidebar (FR-13, FR-14).
- [ ] Drag the divider → the sidebar widens/narrows, the window grows with it until it hits the screen edge, after which the translation area narrows (FR-8, FR-9, FR-10). Restart the app → the width is preserved (FR-9).
- [ ] Restart with the sidebar last on left/right → it reopens docked at the same side and width, translation area at its base width (FR-4).
- [ ] Click "pop out" in the sidebar header → the standalone history window opens pre-filtered to the current action, the docked sidebar hides, and the window width restores (FR-17, FR-18, FR-19, FR-20). In the window, broaden the filter to "All Actions", pick a record from a **different** action → the main window switches to that action and loads the record (FR-19, FR-21). Close the window → sidebar stays hidden; the footer button cycles it back (FR-20).

- [ ] **Step 4: Confirm non-Tauri is unaffected**

Run: `pnpm dev-chromium` and load the extension popup; click the history button → the **modal** still opens (no sidebar, no errors) (FR-5, NFR-4).

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "fix(history): address sidebar verification findings"
```

---

## Self-Review

**1. Spec coverage**

| Spec | Task |
|---|---|
| FR-1 (persist position, default left) | Task 2 (+ test) |
| FR-2 (cycle button) | Task 1 `nextSidebarPosition` + Task 6 |
| FR-3 (render by position) | Task 7 (`<aside>` + offsets) |
| FR-4 (launch restore position+width) | Task 2 (defaults) + existing `useMemoWindow({size:true})`; verified Task 11 |
| FR-5 (Tauri-only) | Task 5 (`sidebarPosition = isTauri() ? … : 'hidden'`), Task 6 branch; verified Task 11 step 4 |
| FR-6 (grow/restore window) | Task 1 math + Task 4 hook + Task 6 |
| FR-7 (left↔right no width change) | Task 6 (`applySidebarPosition` skips resize) |
| FR-8 (screen-bound → translation narrows) | Task 1 `windowWidthOnShow`/`windowWidthOnResize` cap |
| FR-9 (resizable + persisted width) | Task 1 `clampSidebarWidth` + Task 8 + Task 2 |
| FR-10 (drag width policy) | Task 1 `windowWidthOnResize` + Task 8 |
| FR-11 (scope by action) | Task 1 `sidebarActionScope` + Task 3 query |
| FR-12 (switch action updates list) | Task 3 (`useLiveQuery` deps on locked scope) + Task 5 `sidebarScope` |
| FR-13 (live updates) | Task 3 (`useLiveQuery`, unchanged behavior) |
| FR-14 (item fields + per-item actions) | Task 3 (reused list node) |
| FR-15 (search + favorites, no selector) | Task 3 (`hideActionSelect`) |
| FR-16 (empty state) | Task 3 (reused empty branch) |
| FR-17 (click loads, no re-translate) | Task 7 wires `onRestore={handleHistoryRestore}` |
| FR-18 (restore semantics) | existing `handleHistoryRestore` |
| FR-19 (detach + scoped window + broaden) | Task 9 + Task 3 `initialAction*` |
| FR-20 (auto-hide + restore width on detach) | Task 9 `handleSidebarDetach` |
| FR-21 (cross-action restore switches action) | existing `handleHistoryRestore` (sets `activateAction`); verified Task 11 |
| NFR-3 (theme/stack consistency) | Tasks 3/7 reuse `baseui-sd`/`react-jss`/theme |
| NFR-4 (no non-Tauri regression) | Task 5/6 gating; verified Task 11 step 4 |

NFR-1 (virtualization) is intentionally **not** implemented — it is a "consider" in the spec and the existing list is capped at 200 with no virtualization; matching current behavior avoids scope creep. Flagging here so it is a conscious omission, not a gap.

**2. Placeholder scan:** No `TBD`/`TODO`/"appropriate"/"handle edge cases". The one "MOVE verbatim" instruction (Task 3 Step 5) is a precise code-move of an identified line range, not a vague placeholder.

**3. Type consistency:** `SidebarPosition`, `nextSidebarPosition`, `clampSidebarWidth`, `windowWidthOnShow/Hide/Resize`, `sidebarActionScope`, `sidebarLayoutOffsets`, `HISTORY_WINDOW_SCOPE_KEY` (history-sidebar.ts) are used with identical names/signatures in Tasks 2, 4, 5, 6, 8, 9. `useSidebarWindowWidth` returns `{ showSidebar, hideSidebar, resizeSidebar }` — consumed exactly in Tasks 6, 8, 9. `TranslationHistory` props `variant`/`lockedActionId`/`lockedActionMode`/`onDetach`/`initialActionId`/`initialActionMode` (Task 3) match the call sites in Task 7 (`<aside>`) and Task 9 (HistoryWindow).
