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
