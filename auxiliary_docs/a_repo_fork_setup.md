# Fork 仓库设置与同步

## 目标与范围

本仓库是 [`nextai-translator/nextai-translator`](https://github.com/nextai-translator/nextai-translator) 的个人 fork。

- 用途：自己使用 + 自由迭代，不再向 upstream 提 PR
- 维护方式：定期从 upstream 拉取更新

## Remote 约定

```
origin    https://github.com/JaydonZhao/nextai-translator.git   # 个人 fork（push 目标）
upstream  https://github.com/nextai-translator/nextai-translator.git  # 原作者仓库（只读）
```

> 注意：标准 OSS 约定与本仓库一致 —— `origin` 指向自己的 fork，`upstream` 指向上游。如果 `git clone` 直接克隆了 upstream，需要手动 rename。

## 当初的建立步骤（记录用）

```bash
# 1. 在 GitHub 上创建 fork（public 原生 fork，不能 private 否则失去 fork 关系）
gh repo fork nextai-translator/nextai-translator --clone=false

# 2. 切换本地 remote
git remote rename origin upstream
git remote add origin https://github.com/JaydonZhao/nextai-translator.git

# 3. 推送本地 main 到 fork 并建立 tracking
git push -u origin main
```

### 已知坑

- `gh repo fork <repo> --remote` 与显式仓库参数互斥，会报 `the --remote flag is unsupported when a repository argument is provided`。要么在 clone 目录里跑 `gh repo fork --remote`（自动检测 upstream），要么先 `--clone=false` 再手动 rename remote
- Fork 必须是 **public** —— GitHub 不允许 public 仓库被 fork 成 private（否则会变成「detached fork」失去 fork 关系，无法用 fork 同步功能）

## 日常同步 upstream 更新

```bash
git fetch upstream
git merge upstream/main         # 或 git rebase upstream/main，看个人偏好
git push origin main
pnpm build-tauri                # 重新 build 本地 app（见下方「build 命令」）
```

如果本地有自己的 feature 分支，rebase 更干净：

```bash
git checkout my-feature
git fetch upstream
git rebase upstream/main
```

## Build 命令（重要：别用 `pnpm tauri build`）

正确的 build 命令是 `pnpm build-tauri`（定义见 package.json），它等于：

```
tsc && vite build -c vite.config.tauri.ts   # 重新编译 frontend → dist/tauri/
tauri build                                  # 打 Rust release + bundle .app/.dmg
```

如果直接跑 `pnpm tauri build`，**只会编 Rust 部分，frontend 不会被重 build**，结果是新 build 的 app 看不到你刚 merge 进来的 React 改动。tauri.conf.json 里 `build.beforeBuildCommand` 是空的，没人替你跑 vite。

build 结束后 macOS 上的更新流程：

```bash
# symlink 已经在 /Applications，所以不需要 copy；只要刷一下 LaunchServices 让 Launchpad 拿到新 metadata
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "/Applications/NextAI Translator.app"
```

### 关于 build 末尾那行 `Error A public key has been found, but no private key`

无害。它是 updater artifact 签名步骤，因为本地没有 `TAURI_SIGNING_PRIVATE_KEY`（也不需要——见下文 updater 策略）。`.app` 和 `.dmg` 已经 bundle 成功，可以正常用。

## In-app Updater 策略

`tauri.conf.json` 里 updater endpoint 指向 upstream 的 GitHub releases：

```
https://github.com/nextai-translator/nextai-translator/releases/latest/download/latest.json
```

为了让 updater 起到「真实的提醒」作用而不是误报：

- 本地 `version`（**四处**：`tauri.conf.json` / `package.json` / `Cargo.toml` / `Cargo.lock` 里的 `app` 包）始终对齐 upstream 当前最新 release 的 tag。这样只有 upstream 真发了新 release，app 才会弹更新窗。
  - `Cargo.lock` 容易被漏：`Cargo.toml` 改了版本后，`Cargo.lock` 里 `[[package]] name = "app"` 那条的 `version` 也要同步改，否则 `pnpm build-tauri` 时 cargo 会自动改它、多出一行计划外 diff
- **绝对不要点弹窗里的「Update」按钮** —— Tauri updater 校验签名靠的是 `tauri.conf.json` 里 upstream 的 `pubkey`，签名验证会通过，然后会用 upstream 的官方二进制**直接覆盖你的 fork 版本**，你的所有 customization 就没了
- 看到弹窗的正确动作：点 **Close** → terminal 跑「日常同步 upstream 更新」那段命令

什么时候需要再次把本地 version 跟 upstream 对齐？每次 `git fetch upstream` 拉下来包含 `package.json` / `tauri.conf.json` version bump 的 commit 时，把那个值改成 upstream 当前的 release tag（不一定等于上游的 main HEAD 里写的版本号——以 GitHub Releases 页面为准）。可以用：

```bash
gh release view --repo nextai-translator/nextai-translator --json tagName
```

### 为什么 upstream 源码里 `version` 永远是 `0.1.0`

这是最容易困惑的一点：从 GitHub 拉 upstream 代码，version 字段**不会**带来真实版本号，永远是 `0.1.0`。原因不是被 `.gitignore`（它正常被 git 追踪），而是：

> upstream 的真实版本号由 **CI 在打 release 那一刻临时注入产物，从不回写进 git**。

发布流水线大致是：打 tag `v0.6.19` → CI 触发 → CI 临时把源码里的 `0.1.0` 替换成 `0.6.19` → 编译打包 → `.dmg` 传到 Releases → 那行临时改动**丢弃，不 push 回 main**。所以源码 main HEAD 里永远停在占位值 `0.1.0`（历史上手改过 `0.0.14`→`1.0.0` 几次，后来改用 CI 注入就不动了）。

```
GitHub Releases 页的 tag  v0.6.19   ← 真实版本，事实来源（由 CI 生成）
源码 package.json 里        "0.1.0"   ← 永远的占位符，从不更新
```

**对 fork 的含义**：你没有这条 CI 流水线，本地 `pnpm build-tauri` 手动出包时没人替你注入版本号，所以**必须自己手写**这四处版本号。这不是 upstream 该带给你的东西，而是 fork 特有的本地补丁。

> 顺带解释「为什么 merge 后版本号没被拽回 `0.1.0`」：merge 时你本地的值（上次写的 `0.6.15`）和 upstream 的 `0.1.0` 没有发生行冲突，git 三方合并保留了你的值。所以日常只需把它从上次的旧 release tag 改成最新 tag，而不是每次都从 `0.1.0` 重写。

### merge 后这几个版本号改动要单独 commit

`git merge upstream/main` 这一步**自带一个 merge commit**，upstream 的所有改动都已封进去、已提交。但 merge **之后**你手动做的两件事——bump 四处版本号、写 task log——git 不会自动塞进那个已定型的 merge commit，它们会以「未提交改动」躺在工作树里，需要**另起一个 commit** 收纳（例如 `chore: sync upstream to vX.Y.Z and align version`）。看到这几个未提交文件是预期的，不是出错。

## License 提示

原仓库为 **AGPL-3.0**。个人本地使用 / 不分发的情况下无需开源衍生作品；如果以后把 fork 部署成公开网络服务，需要按 AGPL 公开自己的修改。

## 验证 fork 状态

```bash
gh repo view JaydonZhao/nextai-translator --json isFork,parent,defaultBranchRef
```

应返回 `isFork: true` 且 `parent.owner.login = "nextai-translator"`。
