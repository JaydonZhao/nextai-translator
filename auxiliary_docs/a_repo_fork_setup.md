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

- 本地 `version`（三处：`tauri.conf.json` / `package.json` / `Cargo.toml`）始终对齐 upstream 当前最新 release 的 tag。这样只有 upstream 真发了新 release，app 才会弹更新窗
- **绝对不要点弹窗里的「Update」按钮** —— Tauri updater 校验签名靠的是 `tauri.conf.json` 里 upstream 的 `pubkey`，签名验证会通过，然后会用 upstream 的官方二进制**直接覆盖你的 fork 版本**，你的所有 customization 就没了
- 看到弹窗的正确动作：点 **Close** → terminal 跑「日常同步 upstream 更新」那段命令

什么时候需要再次把本地 version 跟 upstream 对齐？每次 `git fetch upstream` 拉下来包含 `package.json` / `tauri.conf.json` version bump 的 commit 时，把那个值改成 upstream 当前的 release tag（不一定等于上游的 main HEAD 里写的版本号——以 GitHub Releases 页面为准）。可以用：

```bash
gh release view --repo nextai-translator/nextai-translator --json tagName
```

## License 提示

原仓库为 **AGPL-3.0**。个人本地使用 / 不分发的情况下无需开源衍生作品；如果以后把 fork 部署成公开网络服务，需要按 AGPL 公开自己的修改。

## 验证 fork 状态

```bash
gh repo view JaydonZhao/nextai-translator --json isFork,parent,defaultBranchRef
```

应返回 `isFork: true` 且 `parent.owner.login = "nextai-translator"`。
