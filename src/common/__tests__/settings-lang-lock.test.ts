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

function resetStore(seed: FakeStore = {}) {
    for (const k of Object.keys(fakeStore)) delete fakeStore[k]
    Object.assign(fakeStore, seed)
}

describe('settings: source/target language lock normalization', () => {
    beforeEach(() => {
        resetStore()
    })

    it('defaults both lock flags to false when settings are empty', async () => {
        const settings = await getSettings()
        expect(settings.sourceLanguageLocked).toBe(false)
        expect(settings.targetLanguageLocked).toBe(false)
        expect(settings.pinnedSourceLanguage).toBeUndefined()
        expect(settings.pinnedTargetLanguage).toBeUndefined()
    })

    it('keeps lock=true + valid pinned values intact', async () => {
        resetStore({
            sourceLanguageLocked: true,
            targetLanguageLocked: true,
            pinnedSourceLanguage: 'ja',
            pinnedTargetLanguage: 'en',
        })
        const settings = await getSettings()
        expect(settings.sourceLanguageLocked).toBe(true)
        expect(settings.targetLanguageLocked).toBe(true)
        expect(settings.pinnedSourceLanguage).toBe('ja')
        expect(settings.pinnedTargetLanguage).toBe('en')
    })

    it('resets sourceLanguageLocked to false when pinnedSourceLanguage is missing', async () => {
        resetStore({ sourceLanguageLocked: true })
        const settings = await getSettings()
        expect(settings.sourceLanguageLocked).toBe(false)
    })

    it('resets targetLanguageLocked to false when pinnedTargetLanguage is an unknown LangCode', async () => {
        resetStore({
            targetLanguageLocked: true,
            pinnedTargetLanguage: 'not-a-real-code',
        })
        const settings = await getSettings()
        expect(settings.targetLanguageLocked).toBe(false)
    })
})
