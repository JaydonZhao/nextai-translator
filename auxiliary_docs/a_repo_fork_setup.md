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
```

如果本地有自己的 feature 分支，rebase 更干净：

```bash
git checkout my-feature
git fetch upstream
git rebase upstream/main
```

## License 提示

原仓库为 **AGPL-3.0**。个人本地使用 / 不分发的情况下无需开源衍生作品；如果以后把 fork 部署成公开网络服务，需要按 AGPL 公开自己的修改。

## 验证 fork 状态

```bash
gh repo view JaydonZhao/nextai-translator --json isFork,parent,defaultBranchRef
```

应返回 `isFork: true` 且 `parent.owner.login = "nextai-translator"`。
