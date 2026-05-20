# Explain Mode with In-Page Sub-Selection Specification

**Date:** 2026-05-19
**Status:** Draft

## Problem Statement

当前桌面端 Translator 提供 5 个内置 action(translate / polishing / summarize / analyze / explain-code),其中 `explain-code` 仅服务于代码场景。对于「想深入理解一段普通文本(术语、句子、概念、引文)」这一高频需求,用户只能凑合用 `analyze`(偏语法)或 `summarize`(偏摘要),都无法满足「请把这段话讲透」的诉求。

同时,「页内再选中触发新请求」目前只在 translate 模式下生效(`src/common/translate.ts:346-368`),且复用的 prompt 是「单词在句子中的语义/句法」教学模板,主要用于查词。当用户处于"理解一整段文本"的语境下,选中其中某个短语/子句想要进一步解释时,现有 prompt 把它当成「词」处理,产出与诉求错位。

## Goals

- 在 Translator 内新增一个 `mode = 'explain'` 的内置 action,提供通用文本/概念深度解释能力,默认输出为目标语言、Markdown 格式
- 在 explain 模式下,页内子选中(textarea 内任意非全选的连续选区)自动触发一条**针对该子选区的、把原文作为上下文**的新解释请求
- 所有改动局限在 Translator 这一个窗口的 action 列表和 prompt 路径,不新增 Tauri 窗口、不改其它内置 action 的现有行为

## Non-Goals

- **不**新增独立的 ExplainWindow / 不在 `src-tauri/src/windows.rs` 注册新 window label
- **不**改动 `explain-code` 模式的 prompt 或语义 — 二者共存且互不干扰
- **不**为 explain 模式新增独立的全局快捷键、tray 入口、thumb 浮窗分支或浏览器扩展入口
- **不**修改 InlineLookupWindow 的行为(它仍走原有的 inline lookup 路径)
- **不**改变 translate 模式下 `selectedWord` 的现有 sentence+word prompt
- **不**改 history / wordbook / auto-collect / cache 这些既有横切流程,只通过 mode 字段被动接入

## User Journeys

**Journey 1: 切到 explain 模式解释整段文本**
As a Translator 用户,I want to 把一段我看不懂的话切到 explain 模式,so that 我能拿到深入解释而不是翻译/摘要。

Steps:
1. 用户在 Translator 输入框粘贴/输入或被 thumb 唤起带入文本
2. 在顶部 action bar 找到 "Explain" 按钮(已自动注册在内置 action 列表中)并点击
3. `actionStr` 显示 "Explaining..."
4. 输出区流式打印对该文本在目标语言下的深度解释(Markdown 渲染)
5. 完成后 `actionStr` 显示 "Explained"

**Journey 2: 在 explain 输出过程中或完成后再选中子片段**
As a 使用 explain 模式的用户,I want to 在输入框内圈选某个让我仍然困惑的短语/子句,so that 系统针对这个子片段在原文上下文里再讲一次。

Steps:
1. 用户已处于 explain 模式且已有原文 `text` 与一次完整解释结果
2. 用户在输入框 textarea 中通过鼠标选中一个非全选的连续子串(如某个术语或子句)
3. 系统读取选区作为 `selectedWord`,触发新一次 translate 调用
4. `actionStr` 重新进入 "Explaining...",输出区清空并流式打印新解释 — 解释聚焦于这个子片段,但**显式利用原文作为上下文**(例如解释该片段在该原文中的具体含义、为什么作者这样用、是否承担了某种隐含意涵)
5. 用户再次选中其它片段时重复 step 3-4;若用户全选(start=0 && end=value.length)或清空选区,`selectedWord` 被清空,不重发请求

## Functional Requirements

### FR Group 1: 新增 explain mode 类型与注册

- **FR-1:** `TranslateMode` 联合类型(`src/common/translate.ts:9`)新增字面量 `'explain'`,与现有 6 个值并列
- **FR-2:** `builtinActionModes` 数组(`src/common/constants.ts`)新增一条 entry,字段:
  - `name: 'Explain'`
  - `mode: 'explain'`
  - `icon`:从 react-icons 选一个语义合适的图标(候选:`MdOutlineLightbulb` / `MdOutlineHelpOutline` / `IoBookOutline`,实现阶段二选一,需与现有 5 条风格一致)
- **FR-3:** `ActionInternalService.list()` 现有的「按 mode 自动补齐缺失内置 action」逻辑(`src/common/internal-services/action.ts:135-149`)无需改动,仅靠 FR-2 即可让新 action 在下次启动后自动入库并出现在 action bar
- **FR-4:** `actionStrItems`(`src/common/components/Translator.tsx:513-538`)为 `'explain'` 添加 `{ beforeStr: 'Explaining...', afterStr: 'Explained' }`
- **FR-5:** 6 个 locale 文件(`src/common/i18n/locales/{en,ja,th,tr,zh-Hans,zh-Hant}/translation.json`)各添加键 `"Explain"`,值为该语言下对应的「解释」名词:
  - `en: "Explain"` / `zh-Hans: "解释"` / `zh-Hant: "解釋"` / `ja: "解説"` / `tr: "Açıkla"` / `th: "อธิบาย"`
  - 状态串 `"Explaining..."` / `"Explained"` 同样需要 6 个 locale 的对应翻译

### FR Group 2: explain 模式的 prompt 路径

- **FR-6:** 在 `src/common/translate.ts` 的 `switch (query.action.mode)` 中,在 `case 'explain-code'` 之后新增 `case 'explain':` 分支,且**不与 `case 'translate'` 共享 fallthrough**
- **FR-7:** explain 默认分支(`!query.selectedWord || query.writing`)输出:
  - `rolePrompt`:声明角色为「目标语言下的资深讲解者」,任务是对所给文本提供深度解释 — 涵盖核心含义、关键术语、上下文/隐含信息、必要的背景知识。如源语言与目标语言不同,应在解释时点明原文中的关键表达
  - `commandPrompt`:要求用 `targetLangName` 输出,采用 Markdown 段落或要点列表,**禁止逐字翻译**
  - `contentPrompt`:`query.text`
- **FR-8:** explain 子选中分支(`!query.writing && query.selectedWord` 非空):覆盖 FR-7 设定的三个 prompt 字段为 explain-fragment-in-context 模板,使用 XML tag 显式分隔输入边界、采用单轮纯指令风格:
  - `rolePrompt`:声明角色为「在给定原文上下文中讲解片段的专家」;**告知输入会包含 `<original_text>` 与 `<fragment>` 两个 XML tag 块**;解释结构必须**同时给出**:(1) 片段的**字典义**与该原文中的**语境义**(两者并列说明,不只给语境义);(2) 片段在上下文中承担的作用(功能、语气、修辞效果);(3) 隐含信息、典故、惯用语、隐喻;(4) 若是术语/惯用语/固定搭配则展开;并附 3-5 个**与该用法语义相同**的额外源语言例句,并在目标语言下解释;明确要求 Markdown 输出且不要寒暄
  - `commandPrompt`:**单轮纯指令**(不再使用 `Yes, I understand...` 风格的伪 assistant 回合 — 该 few-shot priming 技巧对现代 frontier 模型不仅无收益,反而可能因模型识破"单条 user message 内伪装多轮对话"的格式而干扰理解),形如 `Explain the <fragment> in the context of the <original_text>, following the structure above.`
  - `contentPrompt`:用 XML tag 显式包裹两段输入,避免原文含标点/引号/换行时的边界歧义:
    ```
    <original_text>
    {query.text}
    </original_text>

    <fragment>
    {query.selectedWord}
    </fragment>
    ```
- **FR-9:** explain 分支末尾必须 `break`;**禁止**让 `case 'translate'` 的 selectedWord 模板被 explain 模式无意调用
- **FR-10:** explain 模式下,`query.text.length < 5 && toChinese` 的「中文短词组多译」分支、`isAWord(...)` 的单词模式分支(均位于 `case 'translate'` 内)**不**应被触发

### FR Group 3: 输入框 sub-selection 复用现有机制

- **FR-11:** Translator.tsx 子选取监听(行 862-901)当前通过 `const isTranslate = currentTranslateMode === 'translate'` gate 整个 useEffect — 非 translate 模式会清空 `selectedWord` 并不绑定 `mouseup` 监听器。**必须扩展该 gate 让 explain 模式也启用子选取**,例如:
  ```ts
  const isSelectedWordEnabled = currentTranslateMode === 'translate' || currentTranslateMode === 'explain'
  useEffect(() => {
      if (!isSelectedWordEnabled) { setSelectedWord(''); return undefined }
      // ... 现有 mouseup / compositionstart / compositionend / blur 绑定不变
  }, [isSelectedWordEnabled])
  ```
  原 `isTranslate` 局部常量只在该 useEffect 内部和依赖数组里被引用(同文件另一处 `isTranslate` 在不同作用域内,与此无关),可直接替换为 `isSelectedWordEnabled`
- **FR-12:** Translator.tsx 现有 `useEffect([translateText, selectedWord])`(行 1374-1378)对 explain 模式无需改动 — 它会自动把新 `selectedWord` 传入 `translateText` → `translate({...selectedWord})`
- **FR-13:** Translator.tsx 现有 cache key(`:1303` `${...}:${selectedWord}:${translationFlag}`)对 explain 模式无需改动 — selectedWord 本就在 key 内
- **FR-14:** 全选(`selectionStart === 0 && selectionEnd === value.length`)清空 `selectedWord` 的现有逻辑(`Translator.tsx:874-877`)在 explain 模式同样生效;此时回退为 FR-7 的全文 explain

### FR Group 4: action 元数据

- **FR-15:** explain 内置 action 入库时 `outputRenderingFormat = 'markdown'`(若 `builtinActionModes` 当前结构未包含此字段,实现阶段需在 ActionInternalService 注册逻辑里设默认值,或在数据库 entry 上显式赋 `'markdown'`)
- **FR-16:** explain 内置 action 不携带自定义 `rolePrompt` / `commandPrompt`(留空) — 走 FR-6 至 FR-9 定义的 hard-coded prompt 路径,与 `translate` / `summarize` 等现有内置 action 一致

## Non-Functional Requirements

- **NFR-1:** 不引入任何新的 npm 依赖
- **NFR-2:** 不修改 `src-tauri/` 下任何 Rust 代码 — explain 是纯前端 + prompt 改动
- **NFR-3:** 不改动 streaming / abort signal / `onMessage` / `onFinish` 路径 — explain 复用现有 `translate()` 调用契约
- **NFR-4:** 不改动 history persistence(`historyService.create/update`)的字段 schema — explain 通过 `actionMode = 'explain'` 落库
- **NFR-5:** 现有用户的自定义 action(`mode = null/undefined`)行为不受影响 — `case null/undefined` 分支不动
- **NFR-6:** explain 模式 sub-selection 触发的请求延迟与现有 translate 模式 sub-selection 在同等输入下不应有可观测差异(均走同一个 `translateText` debounce/effect 链)

## Technical Context

**关键文件与函数:**
- `src/common/translate.ts:9` — `TranslateMode` 类型
- `src/common/translate.ts:236-403` — mode switch 主体
- `src/common/translate.ts:346-368` — 现有 translate 模式的 sentence+word selectedWord 分支(参考结构,**不复用 prompt 文案**)
- `src/common/constants.ts:5-31` — `builtinActionModes`
- `src/common/internal-services/action.ts:135-149` — built-in action 自动 seed 逻辑
- `src/common/components/Translator.tsx:513-538` — `actionStrItems`
- `src/common/components/Translator.tsx:873-896` — textarea mouseup → selectedWord
- `src/common/components/Translator.tsx:1191-1378` — `translateText` 与 selectedWord effect
- `src/common/components/Translator.tsx:1931-1980` — action bar 渲染
- `src/common/i18n/locales/*/translation.json` — i18n 字串

**架构约束:**
- 内置 action 通过 `mode` 字段路由到 hard-coded prompt;自定义 action(`mode = null`)走用户填写的 prompt 模板。explain 选用前者,因为 prompt 设计要求精确控制
- `selectedWord` 字段已在 `TranslateQuery` 接口里,无需新增类型字段
- cache key 已包含 mode(经由 `action.id`)和 selectedWord,explain 模式与 translate 模式的同样选区不会串 cache

## Edge Cases and Error Handling

- **空 text:** `translateText` 现有 guard `if (!text || ...)` 直接 return,explain 模式同样跳过 — 不发请求
- **全选 textarea:** `Translator.tsx:874-877` 把 `selectedWord` 设为空,explain 模式回退为全文 explain(FR-7)
- **selectedWord 与 text 完全相等(罕见,例如用户全选后又重新选了一遍刚好覆盖整个文本但起止偏移不同):** 走 FR-8 fragment 分支(因为 selectedWord 非空且全选 guard 看的是偏移而非内容);可接受 — 用户行为是显式的
- **writing 模式:** explain 分支与 translate 分支一样,通过 `!query.writing && query.selectedWord` 避免在 writing 上下文中误用 fragment prompt;writing 模式下 explain 仅走 FR-7 的全文路径
- **同语言场景(sourceLang === targetLang):** explain prompt 不应退化为「润色」 — 必须坚持「解释」语义;commandPrompt 中明确「以 {targetLangName} 解释」即可
- **超长 selectedWord(选区横跨整段甚至多段):** 不做长度限制 — 由模型自行处理;cache key 长度上限不是问题(cache 是内存 Map)
- **finish_reason = content_filter / length:** 复用 Translator.tsx:1273-1289 现有错误提示,explain 模式无需特殊处理
- **Locale 缺失:** 若某个 locale 文件未及时补齐 `"Explain"` 键,react-i18next fallback 到 key 本身("Explain")显示 — 可接受降级
- **新装用户与升级用户:** 升级用户首次启动时,`ActionInternalService.list()` 检测到 `mode='explain'` 不在 DB,自动 add 一条 — 透明升级,不需要 migration

## Open Questions

- **Icon 最终选型:** spec 列出三个候选(`MdOutlineLightbulb` / `MdOutlineHelpOutline` / `IoBookOutline`),由实现阶段在 PR 中定;若都不合适,可挑其它 — 但需与 5 条现有内置 action 的 icon set(react-icons/md / io 系列)保持视觉一致
- **Prompt 文案精修:** FR-7 / FR-8 给出语义骨架,具体措辞(英语原文)在实现阶段写出后,建议 spawn `spec-document-reviewer` 或 `claude-api`(若适用)对 prompt 做一轮 review,确保不与现有 prompts 在 tone / 长度 / 结构上违和
- **是否在 explain 模式下显式禁用 word mode UI(如 wordbook 收藏按钮):** 当前 `isWordMode` 由 prompt 路径在 case translate 内显式 `isWordMode = true` 驱动;explain 路径不会设置该 flag,因此默认就是非 word mode,不应触发 wordbook auto-collect。如果实测有泄漏到 word mode 的边缘情况,在实现阶段补 guard
