# Translation History Sidebar Specification

**Date:** 2026-06-10
**Status:** Draft

## Problem Statement

桌面端用户经常需要回看、复用之前的翻译结果（重新读译文、复制、或在原文基础上继续微调）。当前历史记录只能通过**底部历史按钮弹出的独立全屏窗口**访问：

- 查历史与做翻译是**互斥**的——要看历史就得切到另一个窗口，看完再切回来，无法边翻译边参考历史。
- 历史是**全局混在一起**的：翻译、润色、解释、各种自定义 action 的记录全堆在同一个列表里，找某个特定模式下的旧记录要靠搜索/筛选，噪音大。
- 没有"常驻"形态：用户无法把历史固定在视野里持续参考。

我们要在主翻译窗口加一个**常驻、可配置位置、可调宽、按 action 隔离**的历史侧边栏，让"翻译"和"看历史/复用历史"可以并排进行。

## Goals

- 在 Tauri 桌面端主翻译窗口提供一个常驻历史侧边栏，与翻译区**并排**显示（非弹窗、非遮盖）。
- 侧边栏位置为持久化三态 `左 / 右 / 隐藏`，跨重启保留上次使用值，由主界面一个按钮循环切换。
- 侧边栏宽度可由用户拖拽调节，并跨重启保留。
- 侧边栏显示时**自动加宽窗口**，优先保证翻译区可用宽度不被挤压；隐藏时恢复原宽度。
- 侧边栏内容**按当前激活的 action/翻译模式隔离**：只显示当前 action 的历史；切换 action，列表随之切换。
- 点击侧边栏中的任一条记录，可**直接加载**该记录（原文、译文、源/目标语言、action）回翻译界面，且不触发重新翻译。
- 提供「弹出」能力：把历史拆成独立窗口（复用现有 History 窗口），在独立窗口中可跨 action 浏览并加载任一条记录回主窗口。

## Non-Goals

- **不**支持浏览器扩展弹窗与 userscript 注入卡片：该特性仅作用于 Tauri 桌面端。非 Tauri 平台维持现有历史 Modal/窗口行为，不做任何改动。
- **不**改变历史记录的底层数据模型、存储引擎或写入时机（`HistoryItem` / Dexie / IndexedDB 保持现状）。隔离完全靠对现有 `actionId` / `actionMode` 字段的查询过滤实现。
- **不**新增"按来源应用/窗口隔离"或"按语言对隔离"等其他隔离维度——本次隔离维度仅为 action/模式。
- **不**做侧边栏内的历史编辑（除已有的收藏/删除/复制外，不新增改写记录内容的功能）。
- **不**新增跨设备同步、导出、批量管理等历史管理功能。
- **不**改变 Writing / Quick Translator / 划词 Lookup / OCR 等其他功能入口自身的历史读写行为。

## User Journeys

**Journey: 边翻译边参考历史**
As a 桌面端重度用户, I want to 把历史侧边栏固定在窗口右侧, so that 我能一边翻译新内容、一边对照之前同类翻译的措辞。

Steps:
1. 用户点击主界面的侧边栏切换按钮。
2. 窗口向外加宽，右侧出现历史侧边栏，列出**当前 action**（如"翻译"）的历史记录，最新在上。
3. 用户在左侧翻译区正常翻译；每完成一条，右侧列表顶部实时出现新记录。

**Journey: 调节侧边栏宽度**
As a 用户, I want to 拖拽侧边栏边界改变它的宽度, so that 长译文也能在侧边栏里舒服地阅读。

Steps:
1. 侧边栏显示中，用户把光标移到侧边栏与翻译区之间的分隔条上并拖拽。
2. 侧边栏宽度随拖拽变化（在最小/最大限制内）。
3. 重启应用后，侧边栏宽度与上次一致。

**Journey: 切换 action 看对应历史**
As a 用户, I want to 在侧边栏打开时切到"润色"action, so that 侧边栏只显示润色的历史而不被翻译记录干扰。

Steps:
1. 侧边栏处于显示状态，当前显示"翻译"的历史。
2. 用户在主界面切换到"润色"action。
3. 侧边栏列表立即切换为"润色"action 的历史记录。

**Journey: 复用一条旧记录**
As a 用户, I want to 点击侧边栏里的某条历史, so that 它的原文和译文被原样加载回翻译界面，我可以直接复制或在其基础上修改。

Steps:
1. 用户在侧边栏中点击某条记录。
2. 翻译界面的源/目标语言、action、输入框（原文）、结果区（译文）被一次性填充为该记录的内容。
3. **不**触发新的翻译请求；用户可直接复制译文，或编辑原文后再手动触发翻译。

**Journey: 循环切换位置 / 隐藏**
As a 用户, I want to 用一个按钮在 左→右→隐藏 之间循环, so that 我能按习惯快速调整或收起侧边栏。

Steps:
1. 侧边栏当前在左侧。用户点击切换按钮 → 移到右侧（窗口总宽度不变，仅左右换位）。
2. 再点 → 隐藏，窗口宽度恢复到无侧边栏时的宽度。
3. 再点 → 回到左侧，窗口再次加宽。
4. 关闭并重启应用后，侧边栏位置与上次一致。

**Journey: 弹出为独立窗口并跨 action 加载**
As a 用户, I want to 把历史拆成一个独立窗口、在里面浏览所有模式的历史, so that 我能在一个大窗口里找任意一条旧记录并把它送回翻译界面。

Steps:
1. 侧边栏显示中，用户点击侧边栏头部的「弹出」按钮。
2. 系统打开独立历史窗口，初始按当前 action 过滤；用户可在窗口内放宽筛选，浏览其他 action 的历史。
3. 主窗口内的侧边栏自动隐藏，主窗口宽度恢复。
4. 用户在独立窗口中点击某条属于"解释"action 的记录 → 主翻译窗口**先切换到"解释"action**，再加载该条记录的原文与译文。

## Functional Requirements

### 位置与可见性（三态）

- **FR-1:** 新增持久化设置项 `sidebarPosition`，取值 `'left' | 'right' | 'hidden'`，跨重启保留上次使用值（沿用现有 settings 存储机制）；用户**首次**打开应用（无历史配置）时初始化为 `'left'`。
- **FR-2:** 主翻译窗口提供一个切换控件，每次激活按固定顺序循环位置：`左 → 右 → 隐藏 → 左`。该控件复用/取代当前底部的历史按钮。
- **FR-3:** 位置为 `left` 时侧边栏渲染在翻译内容左侧；为 `right` 时渲染在右侧；为 `hidden` 时不渲染侧边栏。
- **FR-4:** 应用启动时从设置读取 `sidebarPosition` 与 `sidebarWidth`，恢复到上次的显示状态与宽度；若位置为 `left/right`，窗口直接以"已含侧边栏"的加宽形态打开（翻译区维持基准宽度，不先窄后宽）。
- **FR-5:** 整个侧边栏特性（FR-1～FR-21）仅在 Tauri 桌面端构建中生效；非 Tauri 平台不暴露该控件、不渲染侧边栏，历史入口维持现状。

### 窗口宽度管理

- **FR-6:** 当侧边栏从隐藏变为显示（hidden → left/right）时，Tauri 窗口宽度增加，使翻译内容区的可用宽度优先**不因侧边栏占位而被压缩**；从显示变为隐藏时，窗口宽度恢复到显示侧边栏之前的宽度。
- **FR-7:** 左右切换（left ↔ right）只改变侧边栏所在侧，不改变窗口总宽度。
- **FR-8:** 当屏幕空间不足以完整加宽时（窗口加宽会超出当前屏幕可用工作区，或触及最小窗口尺寸约束），窗口宽度夹紧到可用边界，**不足的部分由翻译内容区让出（翻译区相应变窄）**，以保证侧边栏按设定宽度完整显示。
- **FR-9:** 新增持久化设置项 `sidebarWidth`（数值，像素），侧边栏宽度可由用户拖拽分隔条调节，调节值被夹紧在 `[最小宽度, 最大宽度]` 区间内，并跨重启保留。
- **FR-10:** 拖拽加宽侧边栏时沿用与 FR-6/FR-8 一致的宽度策略：优先扩大窗口以维持翻译区宽度；当受屏幕/最小尺寸边界限制无法继续扩大窗口时，改由翻译区让出空间（变窄）。

### 侧边栏内容与按 action 隔离

- **FR-11:** 侧边栏列表只显示**当前激活 action/模式**对应的历史记录：内置 action 按 `actionMode` 匹配，自定义 action 按 `actionId` 匹配（与现有 `list()` 过滤及 restore 逻辑保持一致）。
- **FR-12:** 当用户在主界面切换激活的 action 时，侧边栏列表实时切换为该 action 的历史记录。
- **FR-13:** 当前 action 下新增/更新/删除历史记录时，侧边栏列表实时反映变化（最新记录置顶）。
- **FR-14:** 每条记录至少展示：时间、原文、译文；并提供逐条操作：切换收藏、复制译文、删除。
- **FR-15:** 侧边栏提供在**当前 action 范围内**的文本搜索与"只看收藏"过滤。侧边栏内不提供手动 action 选择器（范围已固定为当前 action）。
- **FR-16:** 当前 action 没有任何历史记录时，侧边栏显示空状态提示。

### 加载（复用）一条记录

- **FR-17:** 点击侧边栏中的一条记录，将其原文、译文、源语言、目标语言、action 一次性加载回翻译界面，并且**不触发新的翻译请求**（复用现有 `handleHistoryRestore`）。
- **FR-18:** 加载后沿用现有 restore 语义：后续对该条的编辑更新同一条记录而非新建，且抑制紧随其后的自动翻译。

### 弹出为独立窗口

- **FR-19:** 侧边栏头部提供「弹出 / detach」控件，点击后打开现有独立历史窗口（`HISTORY_WIN_NAME` / `HistoryWindow`）；窗口初始按**当前 action**过滤，但允许用户在窗口内放宽/切换筛选以浏览其他 action 的历史。
- **FR-20:** 执行弹出后，主窗口内侧边栏自动隐藏（`sidebarPosition` 置为 `hidden`），主窗口宽度恢复。
- **FR-21:** 在独立历史窗口中点击某条记录，将其加载回主翻译窗口（复用现有 `history:restore` 事件通道）；若该记录所属 action 与主窗口当前激活 action 不同，主窗口**先切换激活 action 至该记录所属 action**，再加载其原文/译文/语言（`handleHistoryRestore` 已含此切换语义）。关闭独立窗口后侧边栏保持隐藏，用户可用切换控件（FR-2）重新调出。

## Non-Functional Requirements

- **NFR-1:** 侧边栏在达到查询上限（当前 `limit: 200`）时滚动需流畅；考虑对窄列布局使用虚拟化（`react-window` 已是依赖）以避免长列表卡顿。
- **NFR-2:** 位置循环切换、显示/隐藏、宽度拖拽响应需即时；窗口加宽/恢复与拖拽过程不得有明显卡顿或闪烁。
- **NFR-3:** 侧边栏视觉风格与现有主题（暗色/亮色）一致，复用现有 UI 技术栈（`baseui-sd` + `react-jss` + styletron），不引入与现状冲突的新 UI 体系。
- **NFR-4:** 非 Tauri 构建（浏览器扩展、userscript）行为零回归：历史 Modal 及其入口保持原样。

## Technical Context

实现者需要了解的现有架构（均已存在，可复用）：

- **历史数据与存储**：`HistoryItem` 定义于 `src/common/internal-services/db.ts`（约 34–50 行），含 `actionId / actionName / actionMode / sourceLang / targetLang / text / translatedText / favorite / createdAt / updatedAt` 等字段。存储为 IndexedDB（Dexie，`LocalDB`，DB 名 `openai-translator`）。内部服务 `src/common/internal-services/history.ts` 提供 `create/update/updateFavorite/touch/delete/clear/list/get`；`list()` 已支持 `actionId / actionMode / search / favoritesOnly / limit` 过滤。运行时门面 `src/common/services/history.ts` 在桌面端直接走内部服务。
- **现有历史 UI**：`src/common/components/TranslationHistory.tsx` 支持 `variant='modal'` 与 `variant='window'`，已实现搜索、按 action 筛选、只看收藏、逐条收藏/恢复/复制/删除，列表用 `dexie-react-hooks` 的 `useLiveQuery` 实时刷新（当前未做虚拟化，硬上限 200）。侧边栏可在此组件基础上复用展示逻辑；其已有的 action 筛选下拉正好支撑独立窗口的"跨 action 浏览"（FR-19）。
- **独立历史窗口**：`src/tauri/windows/HistoryWindow.tsx`；窗口标识 `HISTORY_WIN_NAME` 见 `src-tauri/src/windows.rs`；由 `commands.showHistoryWindow()` 打开；恢复记录通过 `emit('history:restore', item)`。
- **记录加载（restore）通路**：`Translator.tsx` 中 `handleHistoryRestore`（约 1393–1428 行）灌入 `sourceLang/targetLang/editableText/translatedText`、**设置 `activateAction`（按 `item.actionId`/`item.actionMode` 切到对应 action，正是 FR-21 跨 action 加载所需）**、设 `historyEntryIdRef` 与 `skipNextTranslateRef` 以避免重新翻译；并监听 `listen('history:restore', ...)`（约 1435–1443 行）。Modal/侧边栏路径可通过 `onRestore` 直连。
- **主翻译布局**：`Translator.tsx` 的 `InnerTranslator`，根容器 `.popupCard`（`height:100%`，无固定宽度），头部与底部均为 `position: fixed; width: 100%`，中间内容滚动。底部历史按钮当前在 Tauri 下触发独立窗口（约 line 2945 一带）。新增侧边栏需重构为"翻译内容 + 侧边栏 + 可拖拽分隔条"的横向布局，并确保固定头/尾不与侧边栏重叠。
- **设置持久化模式**：`ISettings` 定义于 `src/common/types.ts`；键注册表 `settingKeys` 与默认值在 `src/common/utils.ts` 的 `getSettings`；读取用 `useSettings()`（SWR）；即时写入可复用 `Translator.tsx` 中 `persistSettingsPatch`（约 639–644 行，`swrMutate('settings', ...)` + `setSettings(patch)`）的模式——与近期"语言 lock/pin"特性（见 `docs/atelier/specs/B_pinned_source_target_language.md`）写法一致。新增 `sidebarPosition`（默认 `'left'`）与 `sidebarWidth`（数值，建议默认约 320px）均应镜像该模式：types 加字段、`settingKeys` 加键、`getSettings` 加默认值（并对 `sidebarWidth` 做区间夹紧）。
- **窗口尺寸**：`src-tauri/src/windows.rs` 中 translator 窗口初始 `inner_size(620, 700)`、`min_inner_size(540, 600)`、可调整大小。运行时改宽可用 `@tauri-apps/api` 的窗口 `setSize / innerSize`（或对应 Rust 命令）；加宽需读取当前屏幕可用工作区以实现 FR-8 的边界夹紧。
- **桌面端判定**：使用现有 `isDesktopApp()` 作为特性门控。
- **UI 库**：`baseui-sd` 内含 `Drawer`（当前未使用）；但本特性要求"推开内容、并排显示 + 可拖拽分隔条"而非遮盖，倾向用 flex 列布局而非 overlay 抽屉——具体实现方式留给实现计划。

## Edge Cases and Error Handling

- **首次启动 / 无配置**：`sidebarPosition` 初始化为 `'left'`，`sidebarWidth` 初始化为默认值。
- **启动时位置为 left/right**：窗口直接以"已含侧边栏"的加宽形态、按上次 `sidebarWidth` 打开（翻译区维持基准宽度），而非先按基准宽度打开再让侧边栏挤占。
- **窗口加宽触及屏幕边界 / 多显示器**：按 FR-8，窗口夹紧到屏幕可用工作区，剩余不足由翻译区变窄承担，侧边栏始终按设定宽度完整显示。
- **宽度拖拽越界**：拖拽值被夹紧在 `[最小宽度, 最大宽度]` 内；当窗口已抵屏幕边界仍继续加宽侧边栏时，翻译区相应变窄（FR-10）。
- **当前 action 无历史**：列表显示空状态提示，不报错（FR-16）。
- **快速连续切换 action**：列表始终以最终激活的 action 为准（依赖 `useLiveQuery` 的查询键随 action 变化）。
- **删除当前已加载的记录**：从侧边栏删除一条记录时，若该条正是当前加载在翻译区的记录，翻译区内容保持不变（已加载的文本不被清空），仅列表中移除该项；后续"更新同一条"的语义按现有 restore 实现处理。
- **自定义 action 被删除**：其历史记录的 `actionId` 成为孤儿，不会出现在任何现存 action 的侧边栏中；本次不做迁移或回收（沿用现状）。独立窗口若放宽筛选仍可能展示这些孤儿记录——属可接受现状。
- **内置 vs 自定义 action 的匹配**：过滤必须与 restore 一致——内置按 `actionMode`、自定义按 `actionId`，避免错配导致串号或漏显。
- **用户手动调整过窗口宽度后再切换侧边栏**：以"切换发生时刻"的当前宽度为基准做加/减，保证一次加宽对应一次等量恢复，避免宽度漂移。
- **侧边栏隐藏时执行弹出**：弹出控件位于侧边栏内，仅在侧边栏显示时可点；隐藏态下用户需先循环到 left/right 才能弹出（可接受）。
- **跨 action 从独立窗口加载**：选中的记录所属 action 与主窗口当前 action 不同时，主窗口先切换 action 再加载（FR-21）；侧边栏（已自动隐藏）无需同步。

## Open Questions

评审第一轮提出的问题均已确认并并入上述需求，当前无未决项。已确认决策摘要：

- 首次打开默认位置 = `left`；之后跨重启保留上次值。
- 侧边栏宽度可拖拽调节并持久化（`sidebarWidth`）。
- 屏幕空间不足以加宽时，由翻译区变窄让位（侧边栏保持设定宽度）。
- 独立窗口允许跨 action 浏览；选中任一条记录会让主窗口切到对应 action 再加载。
- 启动时恢复用户上次的位置与宽度配置。
