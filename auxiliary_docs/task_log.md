# Task Log

按时间顺序记录非琐碎的改动，最新条目追加在末尾。

---

### 2026-05-20 — Explain mode 全链路实现 + 子选择再触发

- Task description:
  - 在 Translator 窗口新增 `mode='explain'` 内置 action，对输入文本做通用「解释」；同时支持在输入框内再次拖选片段，针对片段在原文上下文中重新发起 explain 请求
- Changes made:
  - `src/common/translate.ts`：`TranslateMode` 联合类型加 `'explain'`；新增 `buildExplainPrompts` 帮助函数（默认分支解释整段；fragment 分支用 XML tag `<original_text>` / `<fragment>` 显式划定边界，单轮 imperative，不再用伪造对话轮次的「If you understand, say ...」priming trick）；switch 中加 `case 'explain'` 分发
  - `src/common/constants.ts`：`builtinActionModes` 元素加可选 `outputRenderingFormat`；注册 explain 条目（icon `MdOutlineLightbulb`，markdown 输出）
  - `src/common/internal-services/action.ts`：seed 时把 `outputRenderingFormat` 也写入 Dexie
  - `src/common/components/Translator.tsx`：把 mouseup 选词触发的 gate `isTranslate` 改名为 `isSelectedWordEnabled`，覆盖 `'translate' | 'explain'`；`actionStrItems` 加 `explain` 条目
  - 6 个 locale 文件新增 `"Explain"` key
- Issues encountered:
  - 首次手动测试发现 explain 模式下输入框拖选无反应。Spec FR-11 当初错误地以为 mouseup 监听是 mode-agnostic，实际 useEffect 被 `isTranslate` gate 卡死
  - 早期 prompt 写法沿用了「伪造模型回复以坐实 persona」的旧技巧（fake-turn priming）；现代 frontier 模型能识破单条消息内多轮格式的伪装，反而干扰理解
- Resolution steps:
  - 修复 gate 后回写 spec FR-11；commit `d7b7bd0`
  - 重构 prompt 为单轮 imperative + XML tag 边界；commit `d98f0ab`；锁定单测断言「不得出现 `if you understand, say` 字样」「必须包含 `<original_text>` `<fragment>`」
- Commands/scripts executed:
  - `pnpm test`（26 tests pass）
  - `pnpm typecheck` / `pnpm lint`（clean）
  - `pnpm tauri build`（.app 与 .dmg 产物 ok，updater 签名 step 因为没设 `TAURI_SIGNING_PRIVATE_KEY` 报错，但不影响主产物）
- Docs updated:
  - `docs/atelier/specs/A_explain_mode_with_subselect.md`（FR-8 重写为 XML tag 单轮指令；FR-11 修正为必须扩展 `isSelectedWordEnabled` gate）
  - `docs/atelier/plans/A_explain_mode_with_subselect.md`（8 个 TDD 任务）
- References:
  - 相关 commits：`941e527` → `d98f0ab`（共 10 个）

---

### 2026-05-20 — 把仓库 fork 到个人账号下

- Task description:
  - 把 `nextai-translator/nextai-translator` fork 到 `JaydonZhao/nextai-translator` 作为长期个人版本；不再向 upstream 提 PR，只定期拉更新
- Changes made:
  - GitHub 上创建 public 原生 fork（保留 fork 关系，便于使用 GitHub 同步功能）
  - 本地 remote：`origin` 重命名为 `upstream`，新 `origin` 指向 fork
  - 把本地 main 上累积的 10 个 explain feature commit push 到 fork
- Issues encountered:
  - `gh repo fork <repo> --remote --remote-name=origin` 报 `the --remote flag is unsupported when a repository argument is provided`
- Resolution steps:
  - 改用「先 GitHub 端建 fork、再本地手动 rename + add remote」的两段式做法
- Commands/scripts executed:
  - `git remote rename origin upstream`
  - `git remote add origin https://github.com/JaydonZhao/nextai-translator.git`
  - `git push -u origin main`
  - `gh repo view JaydonZhao/nextai-translator --json isFork,parent`（验证 `isFork=true`）
- Docs updated:
  - `auxiliary_docs/a_repo_fork_setup.md`：新建，记录 remote 约定、建立步骤、同步流程、AGPL 提示

---

### 2026-05-20 — 拉取 upstream 更新 + 修正 build 流程 + 对齐 updater 版本号

- Task description:
  - 从 upstream merge 新 commit（thinkingEnabled 设置）；让本地 in-app updater 不再误报；确认正确的 build 命令
- Changes made:
  - `git merge upstream/main`（带入 upstream `99cba7f`：`feat: add thinkingEnabled setting`）；merge commit `7dc0b78`
  - 三处 version `0.1.0` → `0.6.15`（对齐 upstream 当前最新 release tag）：`src-tauri/tauri.conf.json`、`package.json`、`src-tauri/Cargo.toml`；commit `33dd1c4`
  - 用 `pnpm build-tauri` 重新 build（frontend + Rust 都 rebuild），symlink 自动指向新产物
- Issues encountered:
  - **build 完后新 feature 在 UI 里看不到**：根因是用了 `pnpm tauri build` 而不是 `pnpm build-tauri`。前者只编 Rust，**不会** rebuild frontend（`tauri.conf.json` 里 `beforeBuildCommand` 为空）。结果是 .app 里塞的还是旧 `dist/tauri/assets/index-*.js`
  - **每次启动 app 都弹 updater 升级窗**：updater endpoint 指向 upstream releases，upstream 最新 release 是 0.6.15，本地 version 0.1.0 < 0.6.15 → 永远弹窗
- Resolution steps:
  - 改用 `pnpm build-tauri`：`tsc && vite build -c vite.config.tauri.ts && tauri build`
  - 把本地 version 对齐到 upstream 当前 release tag（0.6.15），弹窗消失；以后只在 upstream 真发 release 时才弹
- Commands/scripts executed:
  - `git fetch upstream && git merge --no-edit upstream/main`
  - `gh release view --repo nextai-translator/nextai-translator --json tagName`（确认 upstream 最新 release tag）
  - `pnpm build-tauri`
  - `pkill -f "NextAI Translator.app/Contents/MacOS/app" && lsregister -f "/Applications/NextAI Translator.app" && open "/Applications/NextAI Translator.app"`
- Relevant configuration details:
  - **In-app updater 是「通知工具」，不是「自动升级工具」**。看到弹窗 → 永远点 **Close** → terminal 跑 `git fetch upstream && git merge upstream/main && pnpm build-tauri`。**绝对不能点 Update**，否则 upstream 的二进制会通过签名校验直接覆盖本地 fork
- Docs updated:
  - `auxiliary_docs/a_repo_fork_setup.md`：加「Build 命令」「In-app Updater 策略」两节；「日常同步」加 `pnpm build-tauri` 步骤

---

### 2026-05-20 — Explain fragment prompt 加上字典义并列输出

- Task description:
  - 调整 explain 模式 fragment 分支的 rolePrompt 第 (1) 项语义：从「只解释片段在原文中的语境义」改为「字典义 + 语境义并列解释」；实测中只给语境义往往省略掉用户其实想顺手确认的基础词义，信噪比反而降低
- Changes made:
  - `src/common/translate.ts:113`：`(1) what the fragment means specifically within this original text — not its dictionary meaning in isolation` → `... — both the dictionary meaning in isolation and the meaning it takes on in this context`
  - 仅 prompt 措辞改动，prompt 结构（XML tag 边界、单轮 imperative、3-5 例句、Markdown 输出）与既有 FR-8 约束一致，未触动其他分支
- Docs updated:
  - `docs/atelier/specs/A_explain_mode_with_subselect.md` FR-8：rolePrompt 描述同步重写为「字典义 + 语境义并列」+ 显式编号 (1)-(4) 结构，与代码当前措辞对齐
  - 注：`docs/atelier/plans/A_explain_mode_with_subselect.md` 中两处旧 prompt 引文不改 — 计划文档是 TDD 任务的时间快照，不维护与代码同步
- Commands/scripts executed:
  - `pnpm test --run`（13 tests pass，既有断言不依赖该句措辞）
  - `pnpm exec tsc --noEmit`（clean）
- References:
  - 受影响代码路径：`buildExplainPrompts` fragment 分支（translate.ts:108-122）

---

### 2026-06-08 — 同步 upstream 5 个 commit + 对齐版本号到 0.6.19

- Task description:
  - upstream（`nextai-translator/nextai-translator`）发布了新更新，把这 5 个 commit sync 到个人 fork；顺手修掉本地一直失败的 7 个 openai engine 测试，并让 in-app updater 不再误报
- Changes made:
  - `git merge upstream/main`（merge commit `b7b6b90`），带入 5 个 upstream commit：
    - `07c8add` writing 模式动画从 Backspace 改为浮动 HUD（大改：新增 `src/common/components/QuickTranslator.tsx`、`src/tauri/windows/{QuickTranslatorWindow,WritingIndicatorWindow}.tsx`、`src-tauri/src/ax_context.rs`）
    - `58fa800` 新增 "Insert into previous input" 快捷键
    - `ae35788` 只对支持的模型发 `reasoning_effort:none`（**正是这个修掉了本地 7 个失败测试**）
    - `f3445be` Ollama 通过 `reasoning_effort:none` 关 thinking
    - `96c62a0` 修隐藏预创建窗口的 idle CPU 占用
  - 版本号三处 + lock 文件 `0.6.15` → `0.6.19`（对齐 upstream 当前最新 release tag）：`src-tauri/tauri.conf.json`、`package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`（`app` 包）
- Issues encountered:
  - merge 前本地 `pnpm exec vitest run` 有 7 个失败，全在 `abstract-openai.spec.ts`。根因是上一轮 merge 进来的 `thinkingEnabled` 设置（`abstract-openai.ts` 旧逻辑无条件给所有模型发 `reasoning_effort:'none'`，但测试期望对不支持的模型不发 / 发 `'low'`）。属于 upstream 自己引入又自己在 `ae35788` 修掉的回归，本地无需手动改
- Resolution steps:
  - 先做 `git merge --no-commit --no-ff upstream/main` 试合并探测冲突 → **零冲突**（重叠文件 `Translator.tsx` / `types.ts` / `utils.ts` 全部 auto-merge 成功，lock 功能与 upstream writing HUD 共存）→ `git merge --abort` 还原 → 确认后正式 merge
  - merge 后 `vitest run` 43 tests 全绿（含 lock 功能 `resolve-langs` 9 + `settings-lang-lock` 4，explain 13）
- Commands/scripts executed:
  - `git fetch upstream && git merge --no-edit upstream/main`
  - `gh release view --repo nextai-translator/nextai-translator --json tagName`（确认最新 release tag = `v0.6.19`）
  - `pnpm exec vitest run`（43 pass）、`pnpm exec tsc --noEmit`（clean）
  - `pnpm build-tauri`（`.app` / `.dmg` / `.tar.gz` 三个 bundle 成功，版本 0.6.19；末尾 `BUILD_EXIT:1` 仍是 updater 签名 step 因无 `TAURI_SIGNING_PRIVATE_KEY` 报错，预期无害）
  - `lsregister -f "/Applications/NextAI Translator.app"`（刷新 Launchpad metadata）
- Pending（未做，等用户确认）：
  - **未 `git push origin main`**：push 是 outward-facing 动作，留给用户决定何时推 fork
- References:
  - merge commit `b7b6b90`；同步流程见 `auxiliary_docs/a_repo_fork_setup.md`

---

### 2026-06-11 — 同步 upstream v0.6.20（单个 Windows 修复）+ push fork

- Task description:
  - upstream 又发了 1 个 commit + release tag `v0.6.20`，sync 过来并把累积的 commit 一起 push 到个人 fork
- Changes made:
  - `git merge --no-edit upstream/main`（merge commit `d40521f`），带入 1 个 upstream commit：
    - `6173f1c fix: suspend WebView2 renderers for hidden panels on Windows`（纯 Windows：隐藏面板时挂起 WebView2 渲染器，省资源；只改 `src-tauri/src/{main,windows,writing}.rs` + `src/tauri/windows/QuickTranslatorWindow.tsx` 4 个文件）
  - 版本号四处 `0.6.19` → `0.6.20`（对齐 upstream 最新 release tag）：`tauri.conf.json`、`package.json`、`Cargo.toml`、`Cargo.lock`（`app` 包）
- Issues encountered:
  - 探测 diff 时一开始用了 `git diff HEAD..upstream/main`（两个点、方向反），输出误显示要删掉一大堆 fork 独有文件（specs / task_log / resolve-langs）。改用 `git show <commit>` 和三个点 `...` 后确认：实际只动 4 个 Windows 文件，merge 不会删任何 fork 文件
- Resolution steps:
  - 先 `git merge --no-commit --no-ff` 试合并 → 零冲突 → `git merge --abort` 还原 → 确认后正式 merge
  - merge 后 `vitest run` 43 tests 全绿，`tsc --noEmit` clean
  - 该修复跟本地两个 fork 功能（explain、lang lock）零重叠；本地非 Windows，功能上无感，sync 只为保持与上游对齐
- Commands/scripts executed:
  - `git fetch upstream && git merge --no-edit upstream/main`
  - `gh release view ... --json tagName`（确认 `v0.6.20`）
  - `pnpm exec vitest run`（43 pass）、`pnpm exec tsc --noEmit`（clean）
  - `pnpm build-tauri`（`.app` / `.dmg` 0.6.20 成功，末尾 `BUILD_EXIT:1` 仍是 updater 签名 step 无 key，预期无害）
  - `git push origin main`（把本轮 + 上轮共 3 个 commit 推到 fork）
- Docs updated:
  - `auxiliary_docs/a_repo_fork_setup.md`：上一条目已补「为何源码 version 永远 0.1.0」「四处版本号含 Cargo.lock」「merge 后版本号要单独 commit」三节，本轮无需再改
- References:
  - merge commit `d40521f`；上一轮 sync 见上一条目（2026-06-08）

---

### 2026-06-11 — 修复 macOS 上打开 History 窗口会隐藏整个 app 的 bug

- Task description:
  - 现象：点 History 后主窗口消失，屏幕上只剩 History 窗口，必须去 Dock 点图标才能唤回主窗口；点 History 条目无反应
- Root cause（实证确认，非推测）:
  - History 是独立 Tauri 窗口（`windows.rs::show_history_window`），弹出时抢走焦点 → 主窗口 `onFocusChanged` 失焦 → 因 `autoHideWindowWhenOutOfFocus` 默认开（实测用户磁盘 config.json = true）→ 50ms 后调 `hideTranslatorWindow`
  - macOS 上 `do_hide_translator_window` 执行的是 `tauri::AppHandle::hide(&handle)`（`windows.rs:176`，由 upstream `ad4e9b4`/`9fd4653` 引入，远早于本 fork），这是 NSApp 级「隐藏整个 app」，把主窗口连同 History 一起藏掉；History 又因自身 `useMemoWindow({show:true})` 重新 show，造成「只剩 History」假象
  - 点条目无反应同源：restore 监听器（`Translator.tsx:1435` `listen('history:restore')`）在被隐藏的主窗口 webview 里，JS 挂起 → 广播事件丢失
  - 旁证：`windows.rs:159` 有个 build 时报 unused 的 `is_translator_foreground()`，是 upstream 写了检测自家窗口前台、却从没接上的半成品（且依赖未授权的 accessibility，不可靠，未采用）
- Fix:
  - `src-tauri/src/windows.rs::do_hide_translator_window`：隐藏前先用 `handle.webview_windows()` + `is_focused()` 判断是否有「非 translator 的自家窗口（History/Settings 等）」持有焦点；是则 `return`，不触发整 app 隐藏。用户真正切到别的 app 时（自家窗口都无焦点）才正常隐藏。用 Tauri 原生 `is_focused()`，不依赖 accessibility
- Issues / 调查手段:
  - macOS WKWebView 连不上 chrome-devtools（CDP 只连 Chrome 自身）；AppleScript 无 accessibility 权限 → 改为直接读磁盘实证：WebKit localStorage sqlite（`history_size`/`history_position`）+ Application Support/config.json（`autoHideWindowWhenOutOfFocus`）
  - 顺带发现 `history_position = {x:1264,y:3124}` 物理像素落在主屏外（用户双屏 5K+内建 Retina）——疑似独立的「双屏窗口位置恢复错位」次要 bug，本次未动，截图显示 History 尺寸正常，「占满屏幕」实为「主窗口消失只剩 History」的错觉
- Verification:
  - `pnpm dev-tauri` 热重载后用户手动复现验证：① 主窗口不再消失 ② History 可独立开关、与主窗口并存 ③ 点条目内容正确 restore 进主窗口
  - `pnpm build-tauri` 重新 build release（末尾 `BUILD_EXIT:1` 仍是 updater 签名 step 无 key，预期无害），`lsregister` 刷新后启动新 app
- References:
  - 改动文件：`src-tauri/src/windows.rs`（单处）
