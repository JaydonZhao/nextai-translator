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
    if (baseWidth !== null) {
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
): {
    contentPaddingLeft: number
    contentPaddingRight: number
    barLeft: number | undefined
    barRight: number | undefined
} {
    if (position === 'left') {
        return { contentPaddingLeft: width, contentPaddingRight: 0, barLeft: width, barRight: 0 }
    }
    if (position === 'right') {
        return { contentPaddingLeft: 0, contentPaddingRight: width, barLeft: 0, barRight: width }
    }
    return { contentPaddingLeft: 0, contentPaddingRight: 0, barLeft: undefined, barRight: undefined }
}
