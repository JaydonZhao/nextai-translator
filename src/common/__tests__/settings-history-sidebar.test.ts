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
