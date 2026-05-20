import type { LangCode } from './index'

export interface ResolveLangsSettings {
    defaultTargetLanguage: string
    sourceLanguageLocked: boolean
    targetLanguageLocked: boolean
    pinnedSourceLanguage?: LangCode
    pinnedTargetLanguage?: LangCode
}

export interface ResolveLangsInput {
    text: string
    actionMode: string | undefined
    prevTargetLang: LangCode | undefined
    settings: ResolveLangsSettings
    sessionTargetSuppressed: boolean
    detectFn: (text: string) => Promise<LangCode>
}

export interface ResolveLangsOutput {
    sourceLang: LangCode
    targetLang: LangCode
}

export async function resolveTranslationLangs(input: ResolveLangsInput): Promise<ResolveLangsOutput> {
    const { settings } = input

    const sourceLang: LangCode =
        settings.sourceLanguageLocked && settings.pinnedSourceLanguage
            ? settings.pinnedSourceLanguage
            : await input.detectFn(input.text)

    const targetLang: LangCode = resolveTarget({
        sourceLang,
        actionMode: input.actionMode,
        prevTargetLang: input.prevTargetLang,
        settings,
        sessionTargetSuppressed: input.sessionTargetSuppressed,
    })

    return { sourceLang, targetLang }
}

interface ResolveTargetInput {
    sourceLang: LangCode
    actionMode: string | undefined
    prevTargetLang: LangCode | undefined
    settings: ResolveLangsSettings
    sessionTargetSuppressed: boolean
}

function resolveTarget(input: ResolveTargetInput): LangCode {
    const { settings } = input

    if (settings.targetLanguageLocked && settings.pinnedTargetLanguage) {
        return settings.pinnedTargetLanguage
    }

    const isTranslate = input.actionMode === 'translate'
    const baseDefault = (settings.defaultTargetLanguage as LangCode | undefined) ?? 'en'
    const swapEligible = isTranslate && (!input.sessionTargetSuppressed || input.sourceLang === input.prevTargetLang)

    if (swapEligible) {
        if (input.sourceLang === 'zh-Hans' || input.sourceLang === 'zh-Hant') {
            return 'en'
        }
        return baseDefault
    }

    if (!input.prevTargetLang) {
        return baseDefault || input.sourceLang
    }
    return input.prevTargetLang
}
