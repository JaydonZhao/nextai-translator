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
