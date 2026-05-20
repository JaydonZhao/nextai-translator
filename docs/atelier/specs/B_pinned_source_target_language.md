# 可自定义 Source / Target Language（Lock & Pin）Specification

**Date:** 2026-05-21
**Status:** Draft

## Problem Statement

当前 Translator 在每段新文本到达时，都会强制调用 `detectLang()` 重新检测 source language；target language 则由 `settings.defaultTargetLanguage` 加一条"中文 ↔ 英文"的隐式 swap 启发式共同决定。这导致两类问题：

1. **Source 被覆盖**：UI 顶部的 source 下拉框已经存在，用户即使手动选了一个值，下一段新文本到达时仍会被 `detectLang()` 覆盖，使下拉框看起来"可用但其实无效"。
2. **Target 被自动改**：用户在某些场景明确知道自己要从 X 翻到 Y（例如做翻译练习、对照阅读、术语统一），但 CN↔EN swap 规则会按文本内容自动改 target，破坏了"我说怎么翻就怎么翻"的可控性。

用户希望在保留"默认自动检测 + 自动 swap"便利性的同时，引入一个**显式的"锁定 / pin"机制**，让用户能把当前的 source / target 钉死，钉死之后不再被检测或 swap 覆盖，并且这种 lock 状态可以跨重启保留。

## Goals

- 用户可以在主 Translator 界面分别对 source 和 target 显式 lock / unlock，lock 后该方向的语言不再被自动逻辑改动。
- 用户可以通过 (a) 手动选下拉，或 (b) 点 "Detect" 按钮快速填入检测结果，两种方式确定要 lock 的 source 语言值。
- Lock 状态以及被 pin 的具体语言值持久化到 settings，跨窗口、跨重启保留。
- 未 lock 时的行为与今天**完全一致**（auto-detect + CN↔EN swap）。
- Lock 行为对所有 mode 全局生效（不做 per-action lock），但要尊重各 mode 现有的下拉 disable 规则。

## Non-Goals

- **不**新增"每个 action 各自配置 source/target"的能力（保留为未来扩展）。
- **不**改动 `writing` mode 现有的 `writingTargetLanguage` 独立设置，writing mode 维持现状。
- **不**改动 `i18n`（应用 UI 语言）相关的任何逻辑。
- **不**改动 `detectLang()` 的实现、`languageDetectionEngine` 配置或检测精度。
- **不**新增"按规则自动 lock"（例如检测到某语言就自动 lock）等智能行为，lock 必须由用户显式触发。
- **不**在 Settings 页面新增"默认 source language"字段（lock 的持久化通过 lock 状态本身实现，不引入额外默认值字段）。
- **不**为 lock 状态做云同步或多设备一致性。

## User Journeys

**Journey 1：临时把 source 钉死为指定语言**

As a 用户，我想把 source language 钉死为日语，这样无论后面贴进来的文本是什么，模型都按"这是日语"处理。

Steps:
1. 用户打开 Translator 主界面，看到 source 下拉旁边有一个 lock 图标按钮（未激活态）。
2. 用户从 source 下拉中选择「日本語」。
3. 用户点击 source 旁的 lock 按钮，按钮变为激活态（视觉上明显区别于未激活）。
4. 用户粘贴一段中文文本。系统**不再**调用 `detectLang()`，直接使用日语作为 source 触发翻译。
5. 用户关闭窗口再打开，source 仍保持"锁定为日语"状态。

**Journey 2：用 Detect 按钮快速锁定当前文本语言**

As a 用户，我想快速把"刚才那段文本"的语言钉死，免去手动找下拉项的麻烦。

Steps:
1. 用户已经粘贴了一段文本，source 当前显示自动检测的结果（例如「Deutsch」）。
2. 用户点击 source 旁的 "Detect" 按钮（独立于 lock 按钮）。系统立即重新检测当前文本并把结果写入 source 下拉。
3. 用户确认结果正确，点击 lock 按钮，source 进入锁定态并固定为 Deutsch。
4. 后续新文本到达时不再被检测，固定按 Deutsch 处理。

**Journey 3：钉死 target 防止 CN↔EN swap**

As a 用户，我在做"始终翻成日语"的对照阅读，不想看到系统因为我贴了中文就把 target 自动改成英文。

Steps:
1. 用户从 target 下拉中选择「日本語」。
2. 用户点击 target 旁的 lock 按钮。
3. 用户贴入一段中文。系统**不再**触发 CN→EN swap，直接按中文 → 日语翻译。
4. 用户跨重启再次使用，target 仍锁定为日语。

**Journey 4：解锁回到 auto-detect**

As a 用户，我想退出 pin 模式，回到原来的自动检测行为。

Steps:
1. 用户点击已激活的 lock 按钮（source 或 target 任一）。
2. 按钮回到未激活态，settings 中对应的 `*Locked` 字段写为 `false`；上次 pin 的语言值在 settings 中保留（便于下次再 lock 时一键回到该值）。
3. 下一次新文本到达时，该方向恢复到原始自动行为（source 走 `detectLang()`、target 走默认 + swap heuristic）。

## Functional Requirements

### FR Group A：UI 控件

- **FR-A1：** 在 Translator 主界面 source language 下拉旁新增一个 lock 按钮（图标按钮），存在两种状态："未锁定" / "已锁定"，状态在视觉上必须明显可区分。
- **FR-A2：** 在 Translator 主界面 target language 下拉旁新增一个 lock 按钮，同样具备未锁定 / 已锁定两态。
- **FR-A3：** 在 Translator 主界面 source 下拉旁新增一个独立的 "Detect" 按钮（图标按钮，独立于 lock 按钮）。点击后立即对**当前输入文本**调用一次 `detectLang()` 并把结果写入 source 下拉的当前选中值。
- **FR-A4：** 当某 mode 现行规则使 source 下拉 disabled（如 `explain-code`），该 mode 下 source 的 lock 按钮和 Detect 按钮也必须 disabled。
- **FR-A5：** 当某 mode 现行规则使 target 下拉 disabled（如 `polishing`），该 mode 下 target 的 lock 按钮必须 disabled。
- **FR-A6：** `writing` mode 仍使用 `writingTargetLanguage`，本次 lock UI 不在 writing mode 生效（按现行规则处理）。

### FR Group B：Lock / Pin 行为

- **FR-B1：** Source 处于"已锁定"态时，任何 `getTranslateDeps()` 或翻译流程**不得**调用 `detectLang()` 改写 source 值；source 始终使用被 pin 的语言。
- **FR-B2：** Target 处于"已锁定"态时，CN↔EN swap heuristic 不得触发，target 始终使用被 pin 的语言。
- **FR-B3：** Source 未锁定时，行为与现状一致：每次新文本到达走 `detectLang()`。
- **FR-B4：** Target 未锁定时，行为与现状一致：基线为 `defaultTargetLanguage`，必要时触发 CN↔EN swap。**保留**现有"用户在本会话内手动改过 target 下拉后，本会话剩余时间内不再 swap"的会话级抑制规则——它与 lock 机制不冲突，而是 target 抑制 swap 行为的"轻量版"：lock = 跨会话永久抑制，session 抑制 = 仅本会话临时抑制；两者叠加层次为「无抑制（默认）→ 本会话抑制（手动改过下拉）→ 永久抑制（lock 按钮）」。
- **FR-B5：** Source 锁定后，用户仍可以从 source 下拉手动改值；改值后 lock 状态保持，pin 的语言更新为新值并写回 settings。
- **FR-B6：** Target 锁定后，用户仍可以从 target 下拉手动改值；改值后 lock 状态保持，pin 的语言更新为新值并写回 settings。
- **FR-B7：** Source 解锁瞬间，立即对当前输入文本重新触发一次 `detectLang()`，把结果填回下拉；后续新文本继续走自动检测。
- **FR-B8：** Target 解锁瞬间，恢复"基线 + swap heuristic"行为；同时清除"本会话已被用户手动改过"的会话级抑制状态（即等价于回到初始未操作过的形态）。
- **FR-B9：** "Detect" 按钮的行为与 lock 状态正交：未锁定时点击只是把检测结果写入 source；已锁定时点击则把检测结果写入并把 pin 的语言同步更新到检测结果（即 "重新 detect 并继续锁定为新值"）。
- **FR-B10：** Source / Target 的 lock 状态互相独立，可以单独 lock 一边。
- **FR-B11：** 解锁（点击已激活的 lock 按钮）时，`sourceLanguageLocked` / `targetLanguageLocked` 字段必须立即写回 settings 设为 `false`；`pinnedSourceLanguage` / `pinnedTargetLanguage` 字段**保留**最后一次被 pin 的值（不清除），这样用户下次再点 lock 时能回到上次的 pin 值，无需重新选择。

### FR Group C：持久化

- **FR-C1：** 在 `ISettings` 中新增四个字段：
  - `sourceLanguageLocked: boolean`（默认 `false`）
  - `targetLanguageLocked: boolean`（默认 `false`）
  - `pinnedSourceLanguage?: LangCode`（默认未定义）
  - `pinnedTargetLanguage?: LangCode`（默认未定义）
- **FR-C2：** 每次用户改动 lock 状态（点 lock 按钮）或在 lock 态下改动 source/target 下拉值，对应字段必须立即写回 settings（与现有 settings 写入路径一致）。
- **FR-C3：** 启动 Translator 时，从 settings 读取上述四个字段：
  - 若 `sourceLanguageLocked === true` 且 `pinnedSourceLanguage` 有合法值 → source 进入锁定态并预填该值；
  - 若 `targetLanguageLocked === true` 且 `pinnedTargetLanguage` 有合法值 → target 进入锁定态并预填该值；
  - 若 lock 为 true 但 pin 值缺失或非合法 `LangCode` → 视为未锁定，并把对应 lock 字段重置为 false 写回 settings。
- **FR-C4：** 对老用户（settings 中没有这四个字段），读取时按默认值处理，不报错、不弹窗。

## Non-Functional Requirements

- **NFR-1：** Lock 按钮点击到 UI 反馈延迟应感知不到（与现有 dropdown 操作同量级，<100ms）。
- **NFR-2：** Lock / unlock 操作不得触发整个 Translator 组件重挂载或丢失当前翻译结果。
- **NFR-3：** Lock 状态在 settings 中的字段命名与现有 camelCase 风格一致；新增字段必须能被现有 settings 序列化 / 反序列化路径无缝处理。
- **NFR-4：** 实现不得引入对现有 `detectLang()` / `languageDetectionEngine` 配置 / 翻译引擎调用的任何不兼容修改。

## Technical Context

涉及的关键现有文件 / 代码点：

- `src/common/types.ts`（`ISettings` 接口）：现有语言相关字段 `defaultTargetLanguage`、`writingTargetLanguage`、`i18n`、`languageDetectionEngine`。本次新增 `sourceLanguageLocked` / `targetLanguageLocked` / `pinnedSourceLanguage` / `pinnedTargetLanguage` 四个字段。
- `src/common/utils.ts`：settings 默认值与读写、归一化路径。需要为新字段加默认值与可能的归一化。
- `src/common/lang/index.ts` (`detectLang` ~ L342)：当前检测入口，本次**不修改**，但 lock 路径需要绕过它。
- `src/common/lang/data.ts` + `src/common/lang/index.ts` (`LANG_CONFIGS`)：合法语言代码来源，用于 FR-C3 的"合法值"校验。
- `src/common/components/Translator.tsx`：
  - `getTranslateDeps()` (~L959)：当前在每次翻译时强制调 `detectLang(text)`。需要在此判断 source lock。
  - target 决定逻辑 (~L963-997)：包含 CN↔EN swap heuristic 与 `stopAutomaticallyChangeTargetLang.current` 会话级抑制状态。需要在此判断 target lock。
  - source / target 下拉渲染 (~L1856-1928)：现存 from/to 下拉与 swap 按钮所在区域，新增 lock 按钮和 Detect 按钮的渲染位置。
  - `stopAutomaticallyChangeTargetLang.current = true` 设置位置 (~L1921)：与 FR-B8 解锁时清状态相关。
- `src/common/translate.ts` (L281-282)：消费 `query.detectFrom` / `query.detectTo`，本次不需修改。
- `src/common/internal-services/db.ts` (`Action` 接口)：本次**不修改**（per-action lock 在 Non-Goals 里）。

被 pin 的语言值类型应使用与现有 dropdown 一致的 `LangCode` 字符串。Lock 字段单独使用 boolean 表示，避免用 "空字符串 vs 非空字符串" 这种隐式语义。

## Edge Cases and Error Handling

- **Settings 中 lock=true 但 pin 值缺失**：按 FR-C3 处理，视为未锁定并修正 settings。
- **Settings 中 pin 值是已废弃 / 不合法的 `LangCode`**：同上，视为未锁定并修正 settings。
- **Source 锁定 + 输入空文本**：lock 优先，不触发 detect，source 维持 pin 值；target 同理。
- **用户在 lock 态下进入一个会 disable 该方向下拉的 mode**（例如 lock 了 source 后切到 `explain-code`）：UI 上 source 下拉、lock 按钮、Detect 按钮均 disabled，但 lock 状态本身**保留**在 settings 中；切回支持 source 选择的 mode 时 lock 状态继续生效。
- **用户在 lock 态下点击 Detect 按钮**：按 FR-B9 处理，重新检测并更新 pin 值，lock 保持。
- **用户在 lock 态下点击界面已有的 swap 按钮**（如果当前 swap 按钮可用）：source 和 target 的 pin 值互换，双方的 lock 状态保持不变并被持久化。
- **多个 Translator 实例同时存在**（如多窗口）：由于 settings 是共享的，一个窗口改 lock 状态后，其他窗口下一次读 settings 时才生效；本期不引入跨窗口实时同步。
- **`writing` mode**：lock UI 在 writing mode 下不渲染或全部 disable（与现有"writing 用 `writingTargetLanguage`"的设计一致），不影响 writing mode 原有行为。

## Open Questions

- Lock 按钮和 Detect 按钮的具体图标 / 视觉设计待 UI 阶段定（spec 不锁定具体图标）。
- 是否要在 Settings 页面也提供一个"清除所有 pin / 解除所有 lock"的入口？本期可不做，先用 UI 内 lock 按钮的 toggle 即可，后续如有需要再加。
- 现有 swap 按钮在双方都 lock 时的视觉是否要给提示（"swap 会同时更新两个 pin 值"），还是保持沉默直接 swap？目前 spec 倾向于沉默直接 swap，待用户体验后决定是否补 hint。
