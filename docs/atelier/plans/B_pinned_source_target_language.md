# 可自定义 Source / Target Language（Lock & Pin）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Translator 主界面的 source / target 下拉框各加一个 lock 按钮、给 source 加一个独立 Detect 按钮；lock 后跳过 `detectLang` 与 CN↔EN swap heuristic；lock 状态与 pin 的语言值持久化到 settings 跨重启保留。

**Architecture:** 把 source/target 语言解析逻辑从 `Translator.tsx::getTranslateDeps` 抽出到纯函数 `resolveTranslationLangs`，便于单元测试；`ISettings` 新增 4 个字段，沿用现有 `getSettings()/setSettings()` 路径持久化；UI 层在 Translator header 现有的 source/target Select 旁直接渲染图标按钮，不引入新的 popover/menu。

**Tech Stack:** TypeScript, React, baseui Select / Tooltip, vitest（单测），i18next（i18n），Tauri 2 store polyfill 持久化。

---

## File Structure

**Create:**
- `src/common/lang/resolve-langs.ts` — 纯函数 `resolveTranslationLangs`，封装 detect/swap/lock 决策
- `src/common/lang/__tests__/resolve-langs.test.ts` — 上述函数的单元测试
- `src/common/__tests__/settings-lang-lock.test.ts` — settings 归一化测试（lock=true 但 pin 缺失/非法时回退）

**Modify:**
- `src/common/types.ts` — `ISettings` 加 4 个字段
- `src/common/utils.ts` — `settingKeys` 加 4 个 key、`getSettings()` 归一化新字段
- `src/common/components/Translator.tsx` — `getTranslateDeps` 调用 helper；source/target Select 旁加 lock 与 Detect 按钮；swap 行为在双方都 lock 时同步更新两个 pinned 值
- `src/common/i18n/locales/en/translation.json` — 新增 3 个 key（`"Lock source language"` / `"Lock target language"` / `"Detect source language"`）
- `src/common/i18n/locales/{ja,th,tr,zh-Hans,zh-Hant}/translation.json` — 同上 3 个 key（值可暂留英文文本，由后续翻译人员处理）

**Leave alone (per spec Non-Goals):**
- `src/common/components/Settings.tsx`
- `src/common/internal-services/db.ts`（Action 接口）
- `src/common/lang/index.ts::detectLang` 实现本身

---

## Task 1: 在 `ISettings` 中新增 4 个字段

**Files:**
- Modify: `src/common/types.ts:79-84`

- [ ] **Step 1：在 `defaultTargetLanguage` 与 `writingTargetLanguage` 之间插入 4 个新字段**

Open `src/common/types.ts`. 现有 78-85 行长这样：

```ts
    autoTranslate: boolean
    defaultTranslateMode: Exclude<TranslateMode, 'big-bang'> | 'nop'
    defaultTargetLanguage: string
    alwaysShowIcons: boolean
    hotkey?: string
    displayWindowHotkey?: string
    ocrHotkey?: string
    writingTargetLanguage: string
```

把它改成：

```ts
    autoTranslate: boolean
    defaultTranslateMode: Exclude<TranslateMode, 'big-bang'> | 'nop'
    defaultTargetLanguage: string
    sourceLanguageLocked: boolean
    targetLanguageLocked: boolean
    pinnedSourceLanguage?: LangCode
    pinnedTargetLanguage?: LangCode
    alwaysShowIcons: boolean
    hotkey?: string
    displayWindowHotkey?: string
    ocrHotkey?: string
    writingTargetLanguage: string
```

`LangCode` 已经在该文件顶部 import 过，不需要新增 import。

- [ ] **Step 2：跑 type check，确认编译过**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json 2>&1 | head -40`
Expected: 会出现关于 `utils.ts` 里 `settingKeys` 缺 key 的错误（`Property 'sourceLanguageLocked' is missing in type ...`）。**这是预期的，下一 task 会修复**；不应有 `types.ts` 本身的错误。

- [ ] **Step 3：Commit**

```bash
git add src/common/types.ts
git commit -m "feat(types): add source/target language lock fields to ISettings"
```

---

## Task 2: 在 `utils.ts` 中注册 settingKeys 并加默认值与归一化（先写测试）

**Files:**
- Create: `src/common/__tests__/settings-lang-lock.test.ts`
- Modify: `src/common/utils.ts:41-105` (settingKeys), `src/common/utils.ts:140-210` (normalization in `getSettings`)

- [ ] **Step 1：写归一化测试（先失败）**

Create `src/common/__tests__/settings-lang-lock.test.ts` with this exact content:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../polyfills/tauri', () => {
    let store: Record<string, unknown> = {}
    return {
        getStore: () => ({
            get: async <T,>(key: string) => store[key] as T,
            set: async (key: string, value: unknown) => {
                store[key] = value
            },
            save: async () => undefined,
        }),
        __reset: () => {
            store = {}
        },
        __seed: (values: Record<string, unknown>) => {
            store = { ...store, ...values }
        },
    }
})

import { getSettings } from '../utils'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tauriMock = require('../polyfills/tauri') as {
    __reset: () => void
    __seed: (v: Record<string, unknown>) => void
}

describe('settings: source/target language lock normalization', () => {
    beforeEach(() => {
        tauriMock.__reset()
    })

    it('defaults both lock flags to false when settings are empty', async () => {
        const settings = await getSettings()
        expect(settings.sourceLanguageLocked).toBe(false)
        expect(settings.targetLanguageLocked).toBe(false)
        expect(settings.pinnedSourceLanguage).toBeUndefined()
        expect(settings.pinnedTargetLanguage).toBeUndefined()
    })

    it('keeps lock=true + valid pinned values intact', async () => {
        tauriMock.__seed({
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
        tauriMock.__seed({ sourceLanguageLocked: true })
        const settings = await getSettings()
        expect(settings.sourceLanguageLocked).toBe(false)
    })

    it('resets targetLanguageLocked to false when pinnedTargetLanguage is an unknown LangCode', async () => {
        tauriMock.__seed({
            targetLanguageLocked: true,
            pinnedTargetLanguage: 'not-a-real-code',
        })
        const settings = await getSettings()
        expect(settings.targetLanguageLocked).toBe(false)
    })
})
```

> 注：这里 mock 的 `../polyfills/tauri` 接口形状要与实际文件一致。如果 actual export 名/签名不同（例如不是 `getStore` 而是 `store`、或者 `getSettings()` 的存储入口不一样），按实际改 mock。运行测试若 mock 不生效会立刻看到失败堆栈中提示。先按上面的版本运行，看错误信息再调整。

- [ ] **Step 2：跑测试，确认失败**

Run: `pnpm exec vitest run src/common/__tests__/settings-lang-lock.test.ts`
Expected: 4 个 case 全部 FAIL（要么 type error 要么字段未定义）。

- [ ] **Step 3：在 `utils.ts` 的 `settingKeys` 注册新 key**

Open `src/common/utils.ts`. 找到 `settingKeys` record（line 41 起）。在 `defaultTargetLanguage: 1,` 一行**之后**插入：

```ts
    sourceLanguageLocked: 1,
    targetLanguageLocked: 1,
    pinnedSourceLanguage: 1,
    pinnedTargetLanguage: 1,
```

- [ ] **Step 4：导入 `LANG_CONFIGS` 用于 LangCode 合法性校验**

在 `utils.ts` 顶部已有的 import 里，找到从 `./lang/...` 来的 import；如果没有则新增：

```ts
import { LANG_CONFIGS } from './lang/data'
```

(若 `utils.ts` 已 import 过 `./lang/...` 的东西，复用现有 import 行追加 `LANG_CONFIGS`)

- [ ] **Step 5：在 `getSettings()` 归一化段落里加上 4 个字段的归一化**

找到 `getSettings()` 内部紧跟 `if (!settings.writingTargetLanguage) { ... }` 的位置（约 line 155 左右）。在它**之后**插入：

```ts
    const isValidLangCode = (v: unknown): v is string =>
        typeof v === 'string' && v in LANG_CONFIGS

    if (typeof settings.sourceLanguageLocked !== 'boolean') {
        settings.sourceLanguageLocked = false
    }
    if (typeof settings.targetLanguageLocked !== 'boolean') {
        settings.targetLanguageLocked = false
    }
    if (!isValidLangCode(settings.pinnedSourceLanguage)) {
        settings.pinnedSourceLanguage = undefined
    }
    if (!isValidLangCode(settings.pinnedTargetLanguage)) {
        settings.pinnedTargetLanguage = undefined
    }
    if (settings.sourceLanguageLocked && !settings.pinnedSourceLanguage) {
        settings.sourceLanguageLocked = false
    }
    if (settings.targetLanguageLocked && !settings.pinnedTargetLanguage) {
        settings.targetLanguageLocked = false
    }
```

- [ ] **Step 6：跑测试，确认通过**

Run: `pnpm exec vitest run src/common/__tests__/settings-lang-lock.test.ts`
Expected: 4 个 case 全部 PASS。

- [ ] **Step 7：跑 type check**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json 2>&1 | tail -20`
Expected: 没有与本次改动相关的新错误。

- [ ] **Step 8：Commit**

```bash
git add src/common/utils.ts src/common/__tests__/settings-lang-lock.test.ts
git commit -m "feat(settings): normalize source/target language lock fields with fallback"
```

---

## Task 3: 抽出纯函数 `resolveTranslationLangs`（TDD）

**Files:**
- Create: `src/common/lang/resolve-langs.ts`
- Create: `src/common/lang/__tests__/resolve-langs.test.ts`

- [ ] **Step 1：写测试（先失败）**

Create `src/common/lang/__tests__/resolve-langs.test.ts` with this exact content:

```ts
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
        const out = await resolveTranslationLangs(
            base({ detectFn: vi.fn(async () => 'en' as LangCode) })
        )
        expect(out.targetLang).toBe('zh-Hans')
    })

    it('FR-B4 swap heuristic: unlocked target flips to en when detected source is zh-Hans (translate mode, no suppression)', async () => {
        const out = await resolveTranslationLangs(
            base({ detectFn: vi.fn(async () => 'zh-Hans' as LangCode) })
        )
        expect(out.targetLang).toBe('en')
    })

    it('FR-B4 swap heuristic: also flips to en for zh-Hant', async () => {
        const out = await resolveTranslationLangs(
            base({ detectFn: vi.fn(async () => 'zh-Hant' as LangCode) })
        )
        expect(out.targetLang).toBe('en')
    })

    it('FR-B4 session suppression: when sessionTargetSuppressed=true and prevTargetLang is set, swap heuristic does not fire', async () => {
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

    it('FR-B5/B6 (joint behavior): both locked → both pinned values returned, detectFn never called', async () => {
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
```

- [ ] **Step 2：跑测试，确认全部失败（模块尚不存在）**

Run: `pnpm exec vitest run src/common/lang/__tests__/resolve-langs.test.ts`
Expected: FAIL，错误为 `Cannot find module '../resolve-langs'`.

- [ ] **Step 3：实现 `resolve-langs.ts`**

Create `src/common/lang/resolve-langs.ts` with this exact content:

```ts
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

export async function resolveTranslationLangs(
    input: ResolveLangsInput
): Promise<ResolveLangsOutput> {
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
    const swapEligible =
        isTranslate &&
        (!input.sessionTargetSuppressed || input.sourceLang === input.prevTargetLang)

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
```

- [ ] **Step 4：跑测试，确认全部通过**

Run: `pnpm exec vitest run src/common/lang/__tests__/resolve-langs.test.ts`
Expected: 9 个 case 全部 PASS.

- [ ] **Step 5：跑 type check**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json 2>&1 | tail -20`
Expected: 没有与本次改动相关的新错误。

- [ ] **Step 6：Commit**

```bash
git add src/common/lang/resolve-langs.ts src/common/lang/__tests__/resolve-langs.test.ts
git commit -m "feat(lang): extract pure resolveTranslationLangs helper with lock support"
```

---

## Task 4: 在 `Translator.tsx::getTranslateDeps` 中接入 helper

**Files:**
- Modify: `src/common/components/Translator.tsx:957-998`

- [ ] **Step 1：在 Translator.tsx 顶部新增 import**

找到 `Translator.tsx` 中现有的 `import { detectLang } from '../lang'`（或类似的从 `../lang/index` 的 import）。在其下方追加：

```ts
import { resolveTranslationLangs } from '../lang/resolve-langs'
```

- [ ] **Step 2：替换 `getTranslateDeps` 内的语言决定逻辑**

定位到 `Translator.tsx` line 957-998。整个 `getTranslateDeps = useCallback(...)` block 替换为：

```ts
    const getTranslateDeps = useCallback(
        async function (text: string, action: Action): Promise<typeof translateDeps> {
            const { sourceLang: newSourceLang, targetLang: newTargetLang } =
                await resolveTranslationLangs({
                    text,
                    actionMode: action.mode,
                    prevTargetLang: targetLang,
                    settings: {
                        defaultTargetLanguage: settings.defaultTargetLanguage,
                        sourceLanguageLocked: settings.sourceLanguageLocked,
                        targetLanguageLocked: settings.targetLanguageLocked,
                        pinnedSourceLanguage: settings.pinnedSourceLanguage,
                        pinnedTargetLanguage: settings.pinnedTargetLanguage,
                    },
                    sessionTargetSuppressed: stopAutomaticallyChangeTargetLang.current,
                    detectFn: detectLang,
                })

            setSourceLang(newSourceLang)
            setTargetLang(newTargetLang)
            return await new Promise((resolve) => {
                setTranslateDeps((oldV) => {
                    const newV: typeof translateDeps = {
                        ...oldV,
                        sourceLang: newSourceLang,
                        targetLang: newTargetLang,
                        text,
                    }
                    resolve(newV)
                    return oldV
                })
            })
        },
        [
            targetLang,
            settings.defaultTargetLanguage,
            settings.sourceLanguageLocked,
            settings.targetLanguageLocked,
            settings.pinnedSourceLanguage,
            settings.pinnedTargetLanguage,
        ]
    )
```

> 注意：原版用 `setTargetLang((targetLang_) => { ... })` 的 functional form 读取 prev target；这里改成 from-closure 的 `targetLang` 并加入 deps，行为等价但更易测试与 reasoning。如果跑起来发现 stale closure 问题，可在 Step 5 改回 functional form——但此时 `prevTargetLang` 改为通过 `setTargetLang(prev => { const next = resolveTarget(prev); resolve...; return next })` 包装；helper 调用本身保持纯。

- [ ] **Step 3：跑 type check**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json 2>&1 | tail -30`
Expected: 没有与本次改动相关的新错误（如果出现 `Property 'mode' may be undefined` 之类，根据 Action 类型实际情况把 `action.mode` 写成 `action.mode ?? ''` 或保持 `string | undefined`，helper 的 `actionMode` 字段已声明为 `string | undefined`）。

- [ ] **Step 4：跑 unit tests 确认未破坏现有行为**

Run: `pnpm exec vitest run`
Expected: 所有现有 + 本计划新增的测试全部 PASS。

- [ ] **Step 5：Commit**

```bash
git add src/common/components/Translator.tsx
git commit -m "refactor(translator): route source/target lang resolution through helper"
```

---

## Task 5: 在 i18n 添加 3 个 key

**Files:**
- Modify: `src/common/i18n/locales/en/translation.json`
- Modify: `src/common/i18n/locales/{ja,th,tr,zh-Hans,zh-Hant}/translation.json`

- [ ] **Step 1：在 `en/translation.json` 末尾闭合 `}` 之前插入 3 个 key**

Open `src/common/i18n/locales/en/translation.json`. 找到文件最后一个 key（最末尾的 `"...": "..."`），在它**之后**加一个英文逗号，然后追加：

```json
    "Lock source language": "Lock source language",
    "Lock target language": "Lock target language",
    "Detect source language": "Detect source language"
```

确保最后一个 key 没有尾逗号，整个 JSON 仍合法。

- [ ] **Step 2：对其余 5 个 locale 重复（值复制 key 即可，留待翻译）**

对 `ja`、`th`、`tr`、`zh-Hans`、`zh-Hant` 每个 locale 的 `translation.json` 重复 Step 1，值可以暂用与 key 相同的英文字面量（i18n fallback 行为允许）：

```json
    "Lock source language": "Lock source language",
    "Lock target language": "Lock target language",
    "Detect source language": "Detect source language"
```

> 之后任意人员可以在 PR review 阶段补真实翻译；本期不阻塞实现。

- [ ] **Step 3：跑 JSON 合法性 sanity check**

Run: `for f in src/common/i18n/locales/*/translation.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "OK $f" || echo "BAD $f"; done`
Expected: 每行输出 `OK <path>`.

- [ ] **Step 4：Commit**

```bash
git add src/common/i18n/locales
git commit -m "i18n: add source/target language lock + detect button keys"
```

---

## Task 6: 在 Translator UI 加 source 侧的 Lock 与 Detect 按钮

**Files:**
- Modify: `src/common/components/Translator.tsx:1859-1885` (source `<Select>` 区块)

> **FR-A6 note (适用于 Task 6 与 Task 7):** spec 要求 writing mode 不让 lock UI 生效。本计划在 source/target 的 disabled 条件中使用 `currentTranslateMode === 'explain-code'` 与 `currentTranslateMode === 'polishing'`，**没**额外为 `'writing'` 加分支——因为本仓库 writing mode 走的是独立组件（不复用此 header）。如果在 Task 9 的手动 QA 中发现 writing mode 实际复用了这个 header，请把对应 disabled 条件改成 `currentTranslateMode === 'explain-code' || currentTranslateMode === 'writing'`（source 侧）和 `currentTranslateMode === 'polishing' || currentTranslateMode === 'writing'`（target 侧）。

- [ ] **Step 1：顶部新增 icon import**

在 `Translator.tsx` 现有的 react-icons import 区域（找 `TbArrowsExchange` 那行）相邻处追加：

```ts
import { TbLock, TbLockOpen2, TbScanEye } from 'react-icons/tb'
```

（图标只要从 `react-icons/tb` 里选两到三个语义贴近的；如果项目里已有更常用的图标集，改用同套即可，但**必须保留 lock/unlock 两态视觉差**。）

- [ ] **Step 2：确认 `setSettings` 已经 import**

`Translator.tsx` 已经在 line 32 附近 import 了 `setSettings`，无需再加。如果搜索后发现确实没有：

```ts
import { setSettings } from '../utils'
```

- [ ] **Step 3：替换 source `<div className={styles.from}>` 区块（line 1859-1885）**

把现有的：

```tsx
<div className={styles.from}>
    <Select
        disabled={currentTranslateMode === 'explain-code'}
        size='mini'
        clearable={false}
        options={sourceLangOptions}
        value={[{ id: sourceLang }]}
        overrides={{
            Root: {
                style: {
                    minWidth: '110px',
                },
            },
        }}
        onChange={({ value }) => {
            const langId = value.length > 0 ? value[0].id : sourceLangOptions[0].id
            setSourceLang(langId as LangCode)
            setTranslateDeps((v) => {
                return {
                    ...v,
                    text: editableText,
                    sourceLang: langId as LangCode,
                }
            })
        }}
    />
</div>
```

替换为：

```tsx
<div className={styles.from} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
    <Select
        disabled={currentTranslateMode === 'explain-code'}
        size='mini'
        clearable={false}
        options={sourceLangOptions}
        value={[{ id: sourceLang }]}
        overrides={{
            Root: {
                style: {
                    minWidth: '110px',
                },
            },
        }}
        onChange={({ value }) => {
            const langId = (value.length > 0 ? value[0].id : sourceLangOptions[0].id) as LangCode
            setSourceLang(langId)
            setTranslateDeps((v) => ({
                ...v,
                text: editableText,
                sourceLang: langId,
            }))
            if (settings.sourceLanguageLocked) {
                setSettings({ pinnedSourceLanguage: langId })
            }
        }}
    />
    <Tooltip content={t('Detect source language')} placement='top'>
        <div
            role='button'
            aria-label={t('Detect source language')}
            style={{
                cursor: currentTranslateMode === 'explain-code' ? 'not-allowed' : 'pointer',
                opacity: currentTranslateMode === 'explain-code' ? 0.4 : 1,
                display: 'inline-flex',
            }}
            onClick={async () => {
                if (currentTranslateMode === 'explain-code') return
                const detected = await detectLang(editableText)
                setSourceLang(detected)
                setTranslateDeps((v) => ({
                    ...v,
                    text: editableText,
                    sourceLang: detected,
                }))
                if (settings.sourceLanguageLocked) {
                    setSettings({ pinnedSourceLanguage: detected })
                }
            }}
        >
            <TbScanEye size={16} />
        </div>
    </Tooltip>
    <Tooltip content={t('Lock source language')} placement='top'>
        <div
            role='button'
            aria-pressed={settings.sourceLanguageLocked}
            aria-label={t('Lock source language')}
            style={{
                cursor: currentTranslateMode === 'explain-code' ? 'not-allowed' : 'pointer',
                opacity: currentTranslateMode === 'explain-code' ? 0.4 : 1,
                color: settings.sourceLanguageLocked
                    ? theme.colors.contentAccent
                    : theme.colors.contentSecondary,
                display: 'inline-flex',
            }}
            onClick={async () => {
                if (currentTranslateMode === 'explain-code') return
                if (settings.sourceLanguageLocked) {
                    await setSettings({ sourceLanguageLocked: false })
                    const detected = await detectLang(editableText)
                    setSourceLang(detected)
                    setTranslateDeps((v) => ({
                        ...v,
                        text: editableText,
                        sourceLang: detected,
                    }))
                } else {
                    await setSettings({
                        sourceLanguageLocked: true,
                        pinnedSourceLanguage: sourceLang,
                    })
                }
            }}
        >
            {settings.sourceLanguageLocked ? <TbLock size={16} /> : <TbLockOpen2 size={16} />}
        </div>
    </Tooltip>
</div>
```

要点解释（理解用，不要写进代码注释）：
- `setSettings({...})` 用 partial update 形式更新单个或多个字段——参考同文件 line 1179 `setSettings({ autoCollect: ... })`
- `theme.colors.contentAccent` / `contentSecondary` 取自 baseui 主题 hook；该文件顶部已经有 `const theme = useStyletron()...` 或类似（搜索 `theme.colors` 确认），如果不是这个变量名，按当前文件实际命名调整
- `t(...)` 是 i18n 翻译函数，文件里已有 `const { t } = useTranslation()`，照用

- [ ] **Step 4：跑 type check**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json 2>&1 | tail -30`
Expected: 无新错误。

- [ ] **Step 5：Commit**

```bash
git add src/common/components/Translator.tsx
git commit -m "feat(translator): add source language lock and detect buttons"
```

---

## Task 7: 在 Translator UI 加 target 侧的 Lock 按钮

**Files:**
- Modify: `src/common/components/Translator.tsx:1906-1933` (target `<Select>` 区块)

- [ ] **Step 1：替换 target `<div className={styles.to}>` 区块（line 1906-1933）**

把现有的：

```tsx
<div className={styles.to}>
    <Select
        disabled={currentTranslateMode === 'polishing'}
        size='mini'
        clearable={false}
        options={targetLangOptions}
        value={[{ id: targetLang }]}
        overrides={{
            Root: {
                style: {
                    minWidth: '110px',
                },
            },
        }}
        onChange={({ value }) => {
            stopAutomaticallyChangeTargetLang.current = true
            const langId = value.length > 0 ? value[0].id : targetLangOptions[0].id
            setTargetLang(langId as LangCode)
            setTranslateDeps((v) => {
                return {
                    ...v,
                    text: editableText,
                    targetLang: langId as LangCode,
                }
            })
        }}
    />
</div>
```

替换为：

```tsx
<div className={styles.to} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
    <Select
        disabled={currentTranslateMode === 'polishing'}
        size='mini'
        clearable={false}
        options={targetLangOptions}
        value={[{ id: targetLang }]}
        overrides={{
            Root: {
                style: {
                    minWidth: '110px',
                },
            },
        }}
        onChange={({ value }) => {
            stopAutomaticallyChangeTargetLang.current = true
            const langId = (value.length > 0 ? value[0].id : targetLangOptions[0].id) as LangCode
            setTargetLang(langId)
            setTranslateDeps((v) => ({
                ...v,
                text: editableText,
                targetLang: langId,
            }))
            if (settings.targetLanguageLocked) {
                setSettings({ pinnedTargetLanguage: langId })
            }
        }}
    />
    <Tooltip content={t('Lock target language')} placement='top'>
        <div
            role='button'
            aria-pressed={settings.targetLanguageLocked}
            aria-label={t('Lock target language')}
            style={{
                cursor: currentTranslateMode === 'polishing' ? 'not-allowed' : 'pointer',
                opacity: currentTranslateMode === 'polishing' ? 0.4 : 1,
                color: settings.targetLanguageLocked
                    ? theme.colors.contentAccent
                    : theme.colors.contentSecondary,
                display: 'inline-flex',
            }}
            onClick={async () => {
                if (currentTranslateMode === 'polishing') return
                if (settings.targetLanguageLocked) {
                    await setSettings({ targetLanguageLocked: false })
                    stopAutomaticallyChangeTargetLang.current = false
                } else {
                    await setSettings({
                        targetLanguageLocked: true,
                        pinnedTargetLanguage: targetLang,
                    })
                }
            }}
        >
            {settings.targetLanguageLocked ? <TbLock size={16} /> : <TbLockOpen2 size={16} />}
        </div>
    </Tooltip>
</div>
```

要点：
- target lock 切换时不主动调 `detectLang`（target 不是 detect 出来的）；解锁时把 `stopAutomaticallyChangeTargetLang.current` 设回 false 以满足 FR-B8（"清除会话级抑制状态"）
- 在 lock 态下手动改下拉，同步 `pinnedTargetLanguage` 到 settings 实现 FR-B6

- [ ] **Step 2：跑 type check**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json 2>&1 | tail -20`
Expected: 无新错误。

- [ ] **Step 3：Commit**

```bash
git add src/common/components/Translator.tsx
git commit -m "feat(translator): add target language lock button"
```

---

## Task 8: 让 swap 按钮在 lock 态下同步更新 pinned 值

**Files:**
- Modify: `src/common/components/Translator.tsx:1886-1905` (swap 按钮 onClick)

- [ ] **Step 1：替换 swap 按钮的 onClick**

把现有的：

```tsx
<div
    className={styles.arrow}
    onClick={() => {
        setTranslateDeps((v) => ({
            ...v,
            text: translatedText,
            sourceLang: targetLang ?? 'en',
            targetLang: sourceLang,
        }))
        setSourceLang(targetLang ?? 'en')
        setTargetLang(sourceLang)
        editorRef.current?.focus()
    }}
>
```

替换为：

```tsx
<div
    className={styles.arrow}
    onClick={() => {
        const newSource = (targetLang ?? 'en') as LangCode
        const newTarget = sourceLang
        setTranslateDeps((v) => ({
            ...v,
            text: translatedText,
            sourceLang: newSource,
            targetLang: newTarget,
        }))
        setSourceLang(newSource)
        setTargetLang(newTarget)
        const patch: Partial<typeof settings> = {}
        if (settings.sourceLanguageLocked) patch.pinnedSourceLanguage = newSource
        if (settings.targetLanguageLocked) patch.pinnedTargetLanguage = newTarget
        if (Object.keys(patch).length > 0) {
            setSettings(patch)
        }
        editorRef.current?.focus()
    }}
>
```

满足 spec Edge Cases 里"双方都 lock 时点 swap → 互换 pin 值、lock 状态保持"。

- [ ] **Step 2：跑 type check**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json 2>&1 | tail -20`
Expected: 无新错误。

- [ ] **Step 3：Commit**

```bash
git add src/common/components/Translator.tsx
git commit -m "feat(translator): keep pinned values in sync when swap is used while locked"
```

---

## Task 9: 全量回归 + 手动 dev 验证（不可省）

- [ ] **Step 1：跑所有单测**

Run: `pnpm exec vitest run`
Expected: PASS。

- [ ] **Step 2：跑 type check 全量**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: 0 errors.

- [ ] **Step 3：启动 dev 模式手动验证以下 6 个 Journey/edge**

Run: `pnpm tauri dev`（首次构建较慢；只需要 UI 起来即可，不必等所有热重载完成）。

验证清单（对照 spec User Journeys + Edge Cases）：

1. **Journey 1**：source 下拉选「日本語」→ 点 source lock 按钮 → 按钮变激活态 → 粘贴一段中文 → 检查翻译时 source 仍是「日本語」未被覆盖 → 关闭窗口重开 → source 仍锁定为日语。
2. **Journey 2**：粘贴一段德语 → source 自动 detect 出德语 → 点 Detect 按钮（手动复跑 detect）→ source 仍是德语 → 点 lock → 切换文本到英语 → source 仍是德语。
3. **Journey 3**：target 选「日本語」→ 点 target lock → 贴中文 → target 没有被 swap 成英文 → 重启 → target 仍锁定为日语。
4. **Journey 4**：lock 态下点 lock 按钮解锁 → 按钮回到未激活 → 贴新文本 → source 重新 detect / target 走默认 + swap heuristic。
5. **Edge：lock 状态下进入 explain-code mode**：source 下拉、lock、Detect 全部 disabled；切回 translate → lock 仍然激活。
6. **Edge：双方都 lock 后点 swap**：source/target 视觉位置互换，两个 lock 按钮都仍激活；重启后看到的是 swap 之后的 pin 值。
7. **FR-A6 check：writing mode**：切到 writing mode，确认 source/target lock 按钮要么不渲染、要么 disabled（即 lock UI 在 writing mode 不生效）。如不满足，按 Task 6 / Task 7 上方 "FR-A6 note" 的指引在 disabled 条件中追加 `'writing'`。

- [ ] **Step 4：跑 lint（如果项目要求）**

Run: `pnpm exec eslint "src/common/components/Translator.tsx" "src/common/lang/resolve-langs.ts" "src/common/utils.ts" "src/common/types.ts" --cache`
Expected: 无 error；warning 可以接受但应记录在 PR description。

- [ ] **Step 5：最终 commit / 整理**

如果手动 dev 验证中发现微小 UI 调整（icon 大小、间距），用一个 polish commit 收尾：

```bash
git add src/common/components/Translator.tsx
git commit -m "style(translator): polish lock/detect button spacing and icon sizes"
```

如果一切正常，无需额外 commit。
