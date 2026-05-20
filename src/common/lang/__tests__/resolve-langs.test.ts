import { describe, it, expect, vi } from 'vitest'
import { resolveTranslationLangs, ResolveLangsInput } from '../resolve-langs'
import type { LangCode } from '../index'

function base(overrides: Partial<ResolveLangsInput> = {}): ResolveLangsInput {
    return {
        text: 'hello',
        actionMode: 'translate',
        prevTargetLang: undefined,
        settings: {
            defaultTargetLanguage: 'zh-Hans',
            sourceLanguageLocked: false,
            targetLanguageLocked: false,
            pinnedSourceLanguage: undefined,
            pinnedTargetLanguage: undefined,
        },
        sessionTargetSuppressed: false,
        detectFn: vi.fn(async () => 'en' as LangCode),
        ...overrides,
    }
}

describe('resolveTranslationLangs', () => {
    it('FR-B3: calls detectFn for source when source is not locked', async () => {
        const detectFn = vi.fn(async () => 'de' as LangCode)
        const out = await resolveTranslationLangs(base({ detectFn }))
        expect(detectFn).toHaveBeenCalledOnce()
        expect(out.sourceLang).toBe('de')
    })

    it('FR-B1: skips detectFn and uses pinned source when source is locked', async () => {
        const detectFn = vi.fn(async () => 'de' as LangCode)
        const out = await resolveTranslationLangs(
            base({
                detectFn,
                settings: {
                    defaultTargetLanguage: 'zh-Hans',
                    sourceLanguageLocked: true,
                    targetLanguageLocked: false,
                    pinnedSourceLanguage: 'ja',
                    pinnedTargetLanguage: undefined,
                },
            })
        )
        expect(detectFn).not.toHaveBeenCalled()
        expect(out.sourceLang).toBe('ja')
    })

    it('FR-B4 baseline: unlocked target uses defaultTargetLanguage when detected source is not Chinese', async () => {
        const out = await resolveTranslationLangs(base({ detectFn: vi.fn(async () => 'en' as LangCode) }))
        expect(out.targetLang).toBe('zh-Hans')
    })

    it('FR-B4 swap heuristic: unlocked target flips to en when detected source is zh-Hans', async () => {
        const out = await resolveTranslationLangs(base({ detectFn: vi.fn(async () => 'zh-Hans' as LangCode) }))
        expect(out.targetLang).toBe('en')
    })

    it('FR-B4 swap heuristic: also flips to en for zh-Hant', async () => {
        const out = await resolveTranslationLangs(base({ detectFn: vi.fn(async () => 'zh-Hant' as LangCode) }))
        expect(out.targetLang).toBe('en')
    })

    it('FR-B4 session suppression: when sessionTargetSuppressed=true and prevTargetLang set, swap does not fire', async () => {
        const out = await resolveTranslationLangs(
            base({
                detectFn: vi.fn(async () => 'zh-Hans' as LangCode),
                prevTargetLang: 'ja',
                sessionTargetSuppressed: true,
            })
        )
        expect(out.targetLang).toBe('ja')
    })

    it('FR-B2: locked target uses pinned target regardless of source / suppression', async () => {
        const out = await resolveTranslationLangs(
            base({
                detectFn: vi.fn(async () => 'zh-Hans' as LangCode),
                settings: {
                    defaultTargetLanguage: 'zh-Hans',
                    sourceLanguageLocked: false,
                    targetLanguageLocked: true,
                    pinnedSourceLanguage: undefined,
                    pinnedTargetLanguage: 'ja',
                },
            })
        )
        expect(out.targetLang).toBe('ja')
    })

    it('swap heuristic only fires in translate mode', async () => {
        const out = await resolveTranslationLangs(
            base({
                detectFn: vi.fn(async () => 'zh-Hans' as LangCode),
                actionMode: 'polishing',
            })
        )
        expect(out.targetLang).toBe('zh-Hans')
    })

    it('both locked: both pinned values returned, detectFn never called', async () => {
        const detectFn = vi.fn(async () => 'de' as LangCode)
        const out = await resolveTranslationLangs(
            base({
                detectFn,
                settings: {
                    defaultTargetLanguage: 'zh-Hans',
                    sourceLanguageLocked: true,
                    targetLanguageLocked: true,
                    pinnedSourceLanguage: 'ja',
                    pinnedTargetLanguage: 'fr',
                },
            })
        )
        expect(detectFn).not.toHaveBeenCalled()
        expect(out.sourceLang).toBe('ja')
        expect(out.targetLang).toBe('fr')
    })
})
