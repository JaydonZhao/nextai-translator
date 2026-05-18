# Explain Mode with In-Page Sub-Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `'explain'` TranslateMode as a Translator-window built-in action with a dedicated full-text explanation prompt, plus a sub-selection branch that re-fires an "explain-this-fragment-in-original-context" request when the user selects text inside the input box.

**Architecture:** Pure frontend + prompt change. New mode value flows through existing dispatch: `TranslateMode` union → `builtinActionModes` (auto-seeded into IndexedDB on app start) → `actionStrItems` (UI status text) → `switch (query.action.mode)` in `translate.ts`. Prompt construction for the new mode is extracted into a small **exported pure helper** `buildExplainPrompts(query, sourceLangName, targetLangName)` so it can be unit-tested in isolation. The case arm in the big switch is a thin adapter that delegates to that helper. No new Tauri window, no new shared infra, no new dependencies.

**Tech Stack:** TypeScript, React, Tauri (unchanged), Vitest (existing — `src/common/__tests__/translate.test.ts`), Dexie/IndexedDB for action persistence (auto-seeded, no migration).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/common/translate.ts` | Modify | (a) Add `'explain'` to `TranslateMode`. (b) Add exported `buildExplainPrompts` helper. (c) Add `case 'explain':` arm in switch that delegates to helper. |
| `src/common/__tests__/translate.test.ts` | Modify | Add `describe('buildExplainPrompts', ...)` block — 3 tests covering default branch, fragment branch, writing-mode short-circuit. |
| `src/common/components/Translator.tsx` | Modify | Add `'explain'` entry to `actionStrItems` map (lines 513-538). |
| `src/common/constants.ts` | Modify | (a) Extend `builtinActionModes` element type with optional `outputRenderingFormat`. (b) Add explain entry. |
| `src/common/internal-services/action.ts` | Modify | Pass `outputRenderingFormat` through when seeding built-in actions (lines 141-148). |
| `src/common/i18n/locales/en/translation.json` | Modify | Add `"Explain": "Explain"` |
| `src/common/i18n/locales/zh-Hans/translation.json` | Modify | Add `"Explain": "解释"` |
| `src/common/i18n/locales/zh-Hant/translation.json` | Modify | Add `"Explain": "解釋"` |
| `src/common/i18n/locales/ja/translation.json` | Modify | Add `"Explain": "解説"` |
| `src/common/i18n/locales/tr/translation.json` | Modify | Add `"Explain": "Açıkla"` |
| `src/common/i18n/locales/th/translation.json` | Modify | Add `"Explain": "อธิบาย"` |

**Note on testing strategy:** `actionStrItems` is typed `Record<TranslateMode, IActionStrItem>` — adding `'explain'` to the union without adding the entry causes a TypeScript compile error. We rely on `tsc` for that guarantee (no runtime test). Same applies to the switch in `translate.ts` for default-case correctness. The only logic with branching worth unit testing is `buildExplainPrompts`, which is why we extract it.

---

## Task 1: Add `'explain'` to `TranslateMode` and to `actionStrItems`

This is intentionally bundled — the type extension causes a compile error in `actionStrItems` that the same task fixes. Two related one-line edits, one commit.

**Files:**
- Modify: `src/common/translate.ts:9`
- Modify: `src/common/components/Translator.tsx:513-538`

- [ ] **Step 1: Extend `TranslateMode` union**

In `src/common/translate.ts`, replace line 9:

```ts
export type TranslateMode = 'translate' | 'polishing' | 'summarize' | 'analyze' | 'explain-code' | 'big-bang'
```

with:

```ts
export type TranslateMode = 'translate' | 'polishing' | 'summarize' | 'analyze' | 'explain-code' | 'explain' | 'big-bang'
```

- [ ] **Step 2: Verify the typecheck breaks at `actionStrItems`**

Run: `pnpm exec tsc --noEmit`

Expected: error in `src/common/components/Translator.tsx` similar to:
```
error TS2741: Property 'explain' is missing in type ... but required in type 'Record<TranslateMode, IActionStrItem>'.
```

This confirms the type system caught the missing entry.

- [ ] **Step 3: Add the `'explain'` entry to `actionStrItems`**

In `src/common/components/Translator.tsx`, find the `actionStrItems` constant (lines 513-538). Insert a new entry between `'explain-code'` and `'big-bang'`:

```ts
    'explain-code': {
        beforeStr: 'Explaining...',
        afterStr: 'Explained',
    },
    'explain': {
        beforeStr: 'Explaining...',
        afterStr: 'Explained',
    },
    'big-bang': {
        beforeStr: 'Writing...',
        afterStr: 'Written',
    },
```

(Status strings deliberately match `'explain-code'` — same user-facing semantic; the modes diverge only in prompt and surface placement.)

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm exec tsc --noEmit`

Expected: no errors related to `TranslateMode` or `actionStrItems`. (Other unrelated errors in the project, if any pre-existed, may still appear — this step only verifies that the change you made does not introduce new ones.)

- [ ] **Step 5: Commit**

```bash
git add src/common/translate.ts src/common/components/Translator.tsx
git commit -m "feat(translator): add 'explain' to TranslateMode union and actionStrItems"
```

---

## Task 2: TDD — `buildExplainPrompts` default branch (no selectedWord)

Write the failing test first, then implement just enough to pass.

**Files:**
- Modify: `src/common/__tests__/translate.test.ts`
- Modify: `src/common/translate.ts` (add new exported helper)

- [ ] **Step 1: Add the failing test for the default branch**

At the bottom of `src/common/__tests__/translate.test.ts` (after the closing `})` of the `QuoteProcessor` describe block, around line 162), append:

```ts
import { buildExplainPrompts } from '../translate'

describe('buildExplainPrompts', () => {
    const baseQuery = {
        text: 'The quick brown fox jumps over the lazy dog.',
    }

    it('default branch: produces a full-text explain prompt when selectedWord is absent', () => {
        const result = buildExplainPrompts(baseQuery, 'English', 'Chinese')

        expect(result.rolePrompt).toMatch(/explain/i)
        expect(result.rolePrompt).toContain('Chinese')
        expect(result.commandPrompt).toMatch(/markdown/i)
        expect(result.commandPrompt).toContain('Chinese')
        expect(result.contentPrompt).toBe(baseQuery.text)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/common/__tests__/translate.test.ts -- --run`

Expected: failure — either an import error (`buildExplainPrompts` is not exported) or a runtime `TypeError: buildExplainPrompts is not a function`. Either is acceptable proof the implementation is genuinely missing.

- [ ] **Step 3: Implement the helper with the default branch only**

In `src/common/translate.ts`, after the existing `isAWord` function (around line 70-90, before the main `translate` function declaration), add:

```ts
export interface ExplainPromptInput {
    text: string
    selectedWord?: string
    writing?: boolean
}

export interface ExplainPromptResult {
    rolePrompt: string
    commandPrompt: string
    contentPrompt: string
}

export function buildExplainPrompts(
    query: ExplainPromptInput,
    sourceLangName: string,
    targetLangName: string,
): ExplainPromptResult {
    const useFragmentBranch = !query.writing && !!query.selectedWord
    if (!useFragmentBranch) {
        const rolePrompt = codeBlock`
${oneLine`
You are a senior subject-matter explainer fluent in ${targetLangName}.
Given a passage of ${sourceLangName} text, your job is to explain it in depth in ${targetLangName}:
the core meaning, key terms, implicit assumptions, and any background knowledge a learner needs.
Do not produce a literal translation. Quote source-language phrases inline only when they carry meaning that is hard to convey otherwise.
`}`
        const commandPrompt = oneLine`
Please explain the following text in ${targetLangName}, using Markdown
(short paragraphs and/or bullet lists). Do not translate it word-for-word.
`
        const contentPrompt = query.text
        return { rolePrompt, commandPrompt, contentPrompt }
    }
    // fragment branch implemented in Task 3
    return { rolePrompt: '', commandPrompt: '', contentPrompt: '' }
}
```

(Note: `codeBlock` and `oneLine` are already imported at the top of `translate.ts` from `'common-tags'`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/common/__tests__/translate.test.ts -- --run`

Expected: the new `buildExplainPrompts > default branch` test passes; existing `QuoteProcessor` tests continue to pass.

- [ ] **Step 5: Commit**

```bash
git add src/common/translate.ts src/common/__tests__/translate.test.ts
git commit -m "feat(translate): add buildExplainPrompts helper with default branch"
```

---

## Task 3: TDD — `buildExplainPrompts` fragment branch (selectedWord set)

**Files:**
- Modify: `src/common/__tests__/translate.test.ts`
- Modify: `src/common/translate.ts` (replace fragment-branch placeholder)

- [ ] **Step 1: Add the failing test for the fragment branch**

In `src/common/__tests__/translate.test.ts`, inside the `describe('buildExplainPrompts', ...)` block, append a second `it`:

```ts
    it('fragment branch: when selectedWord is set, prompt explains the fragment using full text as context', () => {
        const query = {
            text: 'The quick brown fox jumps over the lazy dog.',
            selectedWord: 'lazy dog',
        }
        const result = buildExplainPrompts(query, 'English', 'Chinese')

        expect(result.rolePrompt).toMatch(/fragment/i)
        expect(result.rolePrompt).toMatch(/context/i)
        expect(result.rolePrompt).toContain('English')
        expect(result.rolePrompt).toContain('Chinese')
        expect(result.commandPrompt).toMatch(/yes|understand/i)
        expect(result.contentPrompt).toContain('the original text is:')
        expect(result.contentPrompt).toContain(query.text)
        expect(result.contentPrompt).toContain('the fragment is:')
        expect(result.contentPrompt).toContain(query.selectedWord)
    })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/common/__tests__/translate.test.ts -- --run`

Expected: the new `fragment branch` test fails because the helper currently returns empty strings for the fragment branch. `default branch` test still passes.

- [ ] **Step 3: Implement the fragment branch**

In `src/common/translate.ts`, replace the placeholder return at the end of `buildExplainPrompts`:

```ts
    // fragment branch implemented in Task 3
    return { rolePrompt: '', commandPrompt: '', contentPrompt: '' }
```

with:

```ts
    const rolePrompt = codeBlock`
${oneLine`
You are an expert at explaining a fragment of ${sourceLangName} text in the context of the surrounding original text.
I will give you the original text and a fragment selected from it.
Explain in ${targetLangName}:
(1) what the fragment means specifically within this original text — not its dictionary meaning in isolation,
(2) the role it plays in the surrounding text (the function, tone, or rhetorical effect),
(3) any implicit information, allusion, idiom, or metaphor it carries here,
(4) if the fragment is a term, idiom, or fixed expression, expand it.
Then provide 3 to 5 additional ${sourceLangName} examples that use this fragment with the same meaning, and explain each in ${targetLangName}.
Output Markdown.
`}

If you understand, say "Yes, I understand. Please give me the original text and the fragment.", and then I will provide them.`
    const commandPrompt = 'Yes, I understand. Please give me the original text and the fragment.'
    const contentPrompt = `the original text is: ${query.text}\n\nthe fragment is: ${query.selectedWord}`
    return { rolePrompt, commandPrompt, contentPrompt }
```

The full helper now reads as:

```ts
export function buildExplainPrompts(
    query: ExplainPromptInput,
    sourceLangName: string,
    targetLangName: string,
): ExplainPromptResult {
    const useFragmentBranch = !query.writing && !!query.selectedWord
    if (!useFragmentBranch) {
        const rolePrompt = codeBlock`
${oneLine`
You are a senior subject-matter explainer fluent in ${targetLangName}.
Given a passage of ${sourceLangName} text, your job is to explain it in depth in ${targetLangName}:
the core meaning, key terms, implicit assumptions, and any background knowledge a learner needs.
Do not produce a literal translation. Quote source-language phrases inline only when they carry meaning that is hard to convey otherwise.
`}`
        const commandPrompt = oneLine`
Please explain the following text in ${targetLangName}, using Markdown
(short paragraphs and/or bullet lists). Do not translate it word-for-word.
`
        const contentPrompt = query.text
        return { rolePrompt, commandPrompt, contentPrompt }
    }
    const rolePrompt = codeBlock`
${oneLine`
You are an expert at explaining a fragment of ${sourceLangName} text in the context of the surrounding original text.
I will give you the original text and a fragment selected from it.
Explain in ${targetLangName}:
(1) what the fragment means specifically within this original text — not its dictionary meaning in isolation,
(2) the role it plays in the surrounding text (the function, tone, or rhetorical effect),
(3) any implicit information, allusion, idiom, or metaphor it carries here,
(4) if the fragment is a term, idiom, or fixed expression, expand it.
Then provide 3 to 5 additional ${sourceLangName} examples that use this fragment with the same meaning, and explain each in ${targetLangName}.
Output Markdown.
`}

If you understand, say "Yes, I understand. Please give me the original text and the fragment.", and then I will provide them.`
    const commandPrompt = 'Yes, I understand. Please give me the original text and the fragment.'
    const contentPrompt = `the original text is: ${query.text}\n\nthe fragment is: ${query.selectedWord}`
    return { rolePrompt, commandPrompt, contentPrompt }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/common/__tests__/translate.test.ts -- --run`

Expected: both `default branch` and `fragment branch` tests pass; existing `QuoteProcessor` tests remain green.

- [ ] **Step 5: Commit**

```bash
git add src/common/translate.ts src/common/__tests__/translate.test.ts
git commit -m "feat(translate): implement explain-fragment-in-context branch"
```

---

## Task 4: TDD — `buildExplainPrompts` writing-mode short-circuit

Verify that `writing=true` keeps the helper on the default branch even when `selectedWord` is set. This is a guard required by spec FR-8 (`!query.writing && query.selectedWord`).

**Files:**
- Modify: `src/common/__tests__/translate.test.ts`

- [ ] **Step 1: Add the failing test**

Inside the `describe('buildExplainPrompts', ...)` block, append a third `it`:

```ts
    it('writing mode: ignores selectedWord and stays on the default full-text branch', () => {
        const query = {
            text: 'The quick brown fox jumps over the lazy dog.',
            selectedWord: 'lazy dog',
            writing: true,
        }
        const result = buildExplainPrompts(query, 'English', 'Chinese')

        // Should look like the default branch — content is the whole text, no "fragment" framing
        expect(result.contentPrompt).toBe(query.text)
        expect(result.contentPrompt).not.toContain('the fragment is:')
        expect(result.commandPrompt).toMatch(/markdown/i)
    })
```

- [ ] **Step 2: Run the test**

Run: `pnpm test src/common/__tests__/translate.test.ts -- --run`

Expected: test passes — the helper as implemented in Task 3 already short-circuits via `!query.writing && !!query.selectedWord`. (This task locks that behavior in with a regression test rather than implementing new code.)

If the test fails, revisit `buildExplainPrompts` to confirm the `useFragmentBranch` guard reads `!query.writing && !!query.selectedWord`.

- [ ] **Step 3: Commit**

```bash
git add src/common/__tests__/translate.test.ts
git commit -m "test(translate): lock in writing-mode short-circuit for buildExplainPrompts"
```

---

## Task 5: Wire `case 'explain':` into the main switch

**Files:**
- Modify: `src/common/translate.ts:236-403` (the big `switch (query.action.mode)` block)

- [ ] **Step 1: Locate the switch and the end of `case 'explain-code':`**

Open `src/common/translate.ts`. Find the switch statement that starts around line 236 with `switch (query.action.mode) {`. Find the `case 'explain-code':` arm (lines 390-402) and its closing `break`. The closing `}` of the entire switch is at approximately line 403.

- [ ] **Step 2: Insert the new `case 'explain':` arm**

Immediately after the `break` of `case 'explain-code':` (and before the switch's closing `}`), insert:

```ts
            case 'explain': {
                const explainPrompts = buildExplainPrompts(
                    {
                        text: query.text,
                        selectedWord: query.selectedWord,
                        writing: query.writing,
                    },
                    sourceLangName,
                    targetLangName,
                )
                rolePrompt = explainPrompts.rolePrompt
                commandPrompt = explainPrompts.commandPrompt
                contentPrompt = explainPrompts.contentPrompt
                break
            }
```

The variables `sourceLangName` and `targetLangName` are already in scope at this point (computed earlier in the same function, search for `const sourceLangName = getLangName(sourceLangCode)` and `const targetLangName = getLangName(targetLangCode)`).

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: no new errors. (`buildExplainPrompts` is defined in the same file so no extra import is needed; `query.text`, `query.selectedWord`, `query.writing` are all valid fields on `BaseTranslateQuery`.)

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test -- --run`

Expected: all tests pass, including the three new `buildExplainPrompts` tests and the pre-existing `QuoteProcessor` and `openai-api-path` / `abstract-openai` tests.

- [ ] **Step 5: Commit**

```bash
git add src/common/translate.ts
git commit -m "feat(translate): wire 'explain' mode into prompt dispatch switch"
```

---

## Task 6: Register `explain` as a built-in action and propagate `outputRenderingFormat`

**Files:**
- Modify: `src/common/constants.ts`
- Modify: `src/common/internal-services/action.ts:135-149`

- [ ] **Step 1: Extend `builtinActionModes` element type and add the explain entry**

In `src/common/constants.ts`, replace the entire file body (lines 1-32) with:

```ts
import { TranslateMode } from './translate'
import { ActionOutputRenderingFormat } from './internal-services/db'

export const CUSTOM_MODEL_ID = '__custom__'
export const PREFIX = '__yetone-nextai-translator'
export const builtinActionModes: {
    name: string
    mode: Exclude<TranslateMode, 'big-bang'>
    icon: string
    outputRenderingFormat?: ActionOutputRenderingFormat
}[] = [
    {
        name: 'Translate',
        mode: 'translate',
        icon: 'MdOutlineGTranslate',
    },
    {
        name: 'Polishing',
        mode: 'polishing',
        icon: 'MdPalette',
    },
    {
        name: 'Summarize',
        mode: 'summarize',
        icon: 'MdOutlineSummarize',
    },
    {
        name: 'Analyze',
        mode: 'analyze',
        icon: 'MdOutlineAnalytics',
    },
    {
        name: 'Explain Code',
        mode: 'explain-code',
        icon: 'MdCode',
    },
    {
        name: 'Explain',
        mode: 'explain',
        icon: 'MdOutlineLightbulb',
        outputRenderingFormat: 'markdown',
    },
]
export const chatgptArkoseReqParams = 'cgb=vhwi'
```

(Icon `MdOutlineLightbulb` chosen from the spec's three candidates — it sits in the same `react-icons/md` family as four of the existing five entries.)

- [ ] **Step 2: Verify the import resolves**

Run: `pnpm exec tsc --noEmit`

Expected: no error from `constants.ts`. If `ActionOutputRenderingFormat` is not exported from `db.ts`, fall back to typing the field as `'markdown' | 'text' | 'latex'` (the literal union — you can confirm the canonical union by reading `src/common/internal-services/db.ts` and grepping for `ActionOutputRenderingFormat`).

- [ ] **Step 3: Propagate `outputRenderingFormat` in the seed loop**

In `src/common/internal-services/action.ts`, locate the `list()` method (lines 130-153). Replace the `await this.db.action.add({ ... })` block (lines 141-148):

```ts
                await this.db.action.add({
                    idx: count++,
                    name: m.name,
                    mode: m.mode,
                    icon: m.icon,
                    createdAt: now,
                    updatedAt: now,
                })
```

with:

```ts
                await this.db.action.add({
                    idx: count++,
                    name: m.name,
                    mode: m.mode,
                    icon: m.icon,
                    outputRenderingFormat: m.outputRenderingFormat,
                    createdAt: now,
                    updatedAt: now,
                })
```

(Dexie tolerates `undefined` for optional fields, so existing built-ins without `outputRenderingFormat` set continue to seed unchanged.)

- [ ] **Step 4: Typecheck and run tests**

Run: `pnpm exec tsc --noEmit && pnpm test -- --run`

Expected: clean typecheck, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/common/constants.ts src/common/internal-services/action.ts
git commit -m "feat(actions): register 'explain' built-in action with markdown output"
```

---

## Task 7: i18n — add `"Explain"` key to all 6 locale files

Locale files are JSON dictionaries; `actionStr` (status text like `"Explaining..."` / `"Explained"`) is set directly from `actionStrItems` without `t(...)` translation, so only the action *name* needs i18n.

**Files (all Modify):**
- `src/common/i18n/locales/en/translation.json`
- `src/common/i18n/locales/zh-Hans/translation.json`
- `src/common/i18n/locales/zh-Hant/translation.json`
- `src/common/i18n/locales/ja/translation.json`
- `src/common/i18n/locales/tr/translation.json`
- `src/common/i18n/locales/th/translation.json`

- [ ] **Step 1: Add the key to each locale**

In each file, locate the existing `"Explain Code"` key (e.g. in `en/translation.json` it reads `"Explain Code": "Explain Code",`). Insert a new `"Explain"` key directly above or below it. The exact value per locale:

| File | Insert |
|---|---|
| `en/translation.json` | `"Explain": "Explain",` |
| `zh-Hans/translation.json` | `"Explain": "解释",` |
| `zh-Hant/translation.json` | `"Explain": "解釋",` |
| `ja/translation.json` | `"Explain": "解説",` |
| `tr/translation.json` | `"Explain": "Açıkla",` |
| `th/translation.json` | `"Explain": "อธิบาย",` |

Make sure trailing commas are valid (JSON doesn't allow trailing commas at the end of an object — if you place the new key right before the closing `}`, omit the comma; otherwise include it).

- [ ] **Step 2: Verify each file is valid JSON**

Run for each file:

```bash
for f in en zh-Hans zh-Hant ja tr th; do
  python3 -m json.tool src/common/i18n/locales/$f/translation.json > /dev/null && echo "$f OK" || echo "$f FAIL"
done
```

Expected: 6 lines, all `OK`.

- [ ] **Step 3: Verify the key is present in all 6 files**

```bash
for f in en zh-Hans zh-Hant ja tr th; do
  grep -c '"Explain":' src/common/i18n/locales/$f/translation.json
done
```

Expected: `1` printed 6 times (one match per file).

- [ ] **Step 4: Commit**

```bash
git add src/common/i18n/locales
git commit -m "i18n: add 'Explain' key for new explain action"
```

---

## Task 8: Manual smoke test in dev mode

Code is correct in theory; the spec explicitly targets a UI surface, so we must verify the action appears, fires, and the sub-selection branch swaps prompts. This is non-automated by design — `Translator.tsx` mounts a Tauri webview and depends on local model API keys.

**Files:** none (read-only verification)

- [ ] **Step 1: Start the desktop app in dev mode**

Run: `pnpm dev-tauri`

Wait for the Tauri window to launch. (First-time build can take several minutes; subsequent runs are fast.)

If only iterating on the renderer (no Rust changes — true for this plan), `pnpm dev-tauri-renderer` is faster but launches just the Vite dev server; you'd still need a separate Tauri shell to host it. For verification of the full surface (action seeding lives in the renderer but uses the IndexedDB backed by the Tauri webview), prefer `pnpm dev-tauri`.

- [ ] **Step 2: Verify the new action appears in the action bar**

In the Translator window, scan the top action bar. Expected: a new "Explain" button (lightbulb icon) appears alongside Translate / Polishing / Summarize / Analyze / Explain Code.

If the button does not appear: the IndexedDB action table may already be populated from a previous session and the seed loop only adds *missing* modes — this should still work because the seed checks `actions.find((a: Action) => a.mode === m.mode)` and `'explain'` is genuinely new. If still missing, open DevTools (`Cmd+Opt+I`), Application → IndexedDB → action store, and confirm a row with `mode: 'explain'` exists. If not, delete the action store and reload — the seed will repopulate.

- [ ] **Step 3: Verify default explain (full text)**

Type or paste a non-trivial English sentence (e.g. "The Pareto principle states that roughly 80% of consequences come from 20% of causes."). Click the new Explain button. Expected:
- Status indicator changes to "Explaining..."
- Output area streams a depth-first explanation in the configured target language, formatted as Markdown
- Does NOT read like a translation
- Status indicator finishes at "Explained"

- [ ] **Step 4: Verify the sub-selection branch**

Without changing modes, in the same input textarea, select a sub-fragment (e.g. drag-select the word "Pareto"). Expected:
- Status indicator returns to "Explaining..."
- Output area clears and re-streams a new response
- The new response is focused on the selected fragment specifically, references the surrounding text as context, and (if the fragment is meaningful) provides 3-5 example sentences using it
- It is clearly a different response than Step 3, not a re-run of the same prompt

- [ ] **Step 5: Verify full-select clears the sub-selection**

In the same input, press `Cmd+A` (or drag-select the entire content). Expected: no new request fires (full-select is filtered out by `Translator.tsx:874-877`). The previous explain output remains.

- [ ] **Step 6: Verify other modes are unaffected**

Click the Translate button. Expected: a normal translate response, sourceLang/targetLang as configured. Sub-select a word in the input. Expected: the existing sentence+word "this word in this sentence" prompt fires (not the new explain-fragment prompt). This confirms the new switch arm did not accidentally bleed into `case 'translate'`.

- [ ] **Step 7: Stop the dev server and commit only if any fixes were needed**

If everything passes, no commit needed for this task — it is verification, not change. If any defects were found and patched in earlier task files during this manual pass, commit those fixes here:

```bash
git status            # Confirm what changed, if anything
git add <files>
git commit -m "fix: <specific fix found during smoke test>"
```

---

## Self-Review

**1. Spec coverage:**

| Spec FR | Implementing Task |
|---|---|
| FR-1 (`'explain'` in `TranslateMode`) | Task 1 |
| FR-2 (`builtinActionModes` entry) | Task 6 |
| FR-3 (auto-seed via `ActionInternalService.list()`) | Task 6 (no code change to seed condition; only the field propagation) |
| FR-4 (`actionStrItems` entry) | Task 1 |
| FR-5 (i18n key `"Explain"` in 6 locales) | Task 7 |
| FR-6 (new `case 'explain':` arm) | Task 5 |
| FR-7 (default-branch prompt) | Task 2 |
| FR-8 (sub-selection branch prompt) | Task 3 |
| FR-9 (`break` no fallthrough) | Task 5 (the inserted block ends with `break;`) |
| FR-10 (translate-only branches not triggered) | Task 5 (new arm is fully self-contained, does not call into translate-arm code paths) |
| FR-11 (existing textarea mouseup unchanged) | No task — explicitly preserved |
| FR-12 (existing useEffect unchanged) | No task — explicitly preserved |
| FR-13 (existing cache key unchanged) | No task — explicitly preserved |
| FR-14 (full-select clears `selectedWord`) | Task 8 step 5 (manual verification) |
| FR-15 (`outputRenderingFormat = 'markdown'`) | Task 6 (constants entry + seed propagation) |
| FR-16 (no custom prompt fields on action entry) | Task 6 (entry has no `rolePrompt`/`commandPrompt`) |

NFRs (no new deps, no Rust changes, no streaming changes, no schema changes, no break of custom actions, similar latency) are all satisfied by construction — no task needed.

**2. Placeholder scan:** searched for "TBD", "TODO", "implement later", "appropriate", "as needed", "fill in", "etc." — none found in task bodies. Open Questions in the spec are explicitly punted (icon final choice resolved to `MdOutlineLightbulb` in Task 6; prompt wording resolved in Task 2/3; `isWordMode` leakage covered by Task 8 step 6 verification).

**3. Type consistency:**
- `buildExplainPrompts` signature stable across Tasks 2, 3, 5
- `ExplainPromptInput` / `ExplainPromptResult` interface names consistent
- `outputRenderingFormat` field name matches `db.ts:25`
- Task 5's `case 'explain': { ... break; }` block's variable references (`sourceLangName`, `targetLangName`) match what Task 2's helper signature expects
