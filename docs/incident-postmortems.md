# 三次真实事故复盘（Windows + DSH 预览版）

> 中文 | [English](incident-postmortems.en.md)

> 这三件事都不是“DSH 的代码 bug”，而是**操作/环境/预览版变更**导致的。复盘的价值在于：症状怎么认、怎么回滚、怎么防下一次。
> 已匿名化；版本与日期保留，便于对照。

---

## 事故 A：改了工作区权限/完整性 → app 打不开

**时间**：2026-10-13
**环境**：Windows，DSH 桌面版当时安装在**工作区目录内**

### 症状

- 重启 DSH 后窗口起不来；崩溃日志：`Desktop renderer exited: launch-failed`，退出码 `0x80000003`；
- 同一时间给工作区做过“给目录树批量改完整性标签/权限”的操作。

### 根因

- 为了修“工作区写入权限”，对工作区树设置了 **Low 完整性标签**；
- 而 **app 本体就装在工作区里**，标签随继承落到了 `DeepSeek Harness.exe`；
- Electron 渲染进程在低完整性目录里创建失败 → app 无法启动。

> 关键认知：**“工作区”是给 AI 读写的地方，不是装程序的地方。** 程序本体与工作区必须物理隔离。

### 修复

1. 恢复工作区权限/完整性（`icacls "<workspace>" /reset`，完整性改回 `Medium`）；
2. **把 app 搬到工作区之外**（例如 `%LOCALAPPDATA%\Programs\...`）；
3. 重建/修正快捷方式；
4. 复核：进程能启动、无新崩溃日志。

### 预防（写进规则）

- 绝不在 agent 会话里批量修改工作区及子目录的**权限/完整性/所有者**；
- 确需修改时：先 `icacls "<path>" /save <file>` 备份，并说明会波及哪些目录；
- 任何“批量改属性”前，先确认工作区内**没有正在运行的程序本体**；
- 程序安装目录与 agent 工作区物理隔离。

> DSH 后续版本提供了 Windows 沙箱 ACL 诊断技能（`diagnose-windows-sandbox-acl`）与相关插件，能帮助**诊断/修复**同类问题，但**不会自动阻止**你去改 ACL。

---

## 事故 B：Profile 里装出了“第二份核心包”→ 所有会话起不来

**时间**：2026-10-13 深夜
**触发**：为了让一个官方 MCP 包能被解析，在 profile 目录执行了带 `auto-install-peers` 的安装

### 症状

- 新建会话、恢复会话**全部失败**；
- 报错里**几乎每个插件都出现一次** `prompt section "..." is already registered` / `tool "..." is already registered`。

### 根因

- 安装把 **39 个包**（含 24 个 `@deepseek-ai/*` 核心包）装进了 `profiles/<profile>/node_modules/`；
- app 自带一份核心包、profile 又有一份 → **同一个插件被加载两遍** → 重复注册被加载器拒绝 → 运行时构建失败。

### 怎么快速判断

| 现象 | 结论 |
|---|---|
| 只坏一个插件 | 那个插件的问题 |
| **几乎所有插件都报 already registered** | **整体被挂载了两遍**，先查 profile 的 `node_modules` |

检查：

```powershell
Get-ChildItem -Force "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules" |
  Select-Object Name, LinkType, Target
Test-Path "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\@deepseek-ai"
```

- 正常：`node_modules` 里**只应有手动 Junction 的插件实体**；
- 一旦出现 `@deepseek-ai/*` 核心包 → 立即按下面回滚。

### 回滚

1. 关闭 app（进程会锁文件）；
2. 备份 `package.json`、`cordis.patch.yml`、`pnpm-lock.yaml`；
3. 删除 profile 的 `node_modules` 与 `pnpm-lock.yaml`；
4. 还原 `package.json` 的 `dependencies` / `dsh.profile.bundles`；
5. 重启 app → **新建会话 + 恢复老会话**双验证。

### 正确接法（三种，按插件来源选）

| 插件类型 | 正确做法 |
|---|---|
| **app 自带**的官方插件 | 在 profile 的 `cordis.patch.yml` 里用 **`insert:`** 块注册（不用安装） |
| **自己写的**本地插件 | `package.json` 的 `dsh.profile.bundles` + `dependencies: "file:<绝对 ASCII 路径>"` + `node_modules` 建 Junction |
| **npm 上的插件** | 优先用官方插件管理器 / `dsh plugin add`，不要手动 `pnpm add` |

> 规则：**profile 的 `node_modules` 只允许出现“手动 Junction 的插件实体”**，不允许出现 `@deepseek-ai/*` 核心包。

---

## 事故 C：预览版 API 变更 → 插件“加载成功但从未被使用”

**时间**：2026-10-22（DSH `0.2.1-rc.2`）
**背景**：一个自写搜索插件依赖 `ctx.web.searchProviderId` 这个公开属性来“钉住”搜索提供方

### 症状

- 插件日志显示 `registered`，看起来一切正常；
- 但搜索行为/结果与预期不符（例如没有预期的总结答案）；
- 插件“像没装一样”。

### 根因

- 新版把选路改为 `config.searchProvider`（或环境变量），**`searchProviderId` 属性被移除**；
- 插件仍在给一个“没人读的属性”赋值 → 选路没变，**静默失效**。

### 怎么定位（通用套路）

1. 看加载日志：注册成功 ≠ 被使用；
2. 看**行为差异**，不要只看日志；
3. 用 `file:line` 对照当前版本的源码（`app.asar` 内可读包源码）；
4. 对比新旧版本的 API；
5. 修好后再做一次行为验证（不要只看状态）。

### 修复

- 在 profile 的 `cordis.patch.yml` 中显式覆盖选路配置（按 id 覆盖，注意**整段替换**，把必要字段一起写上）；
- 记录“适用版本”；升级后重跑回归（见 `upgrade-checklist.md`）。

### 教训

- DSH 处于 **developer preview**，破坏性变更会继续出现；
- 插件要做**兼容探测**（运行时探测能力，而不是写死版本/属性）；
- 任何“加载成功”都要配一次**端到端行为验证**。

---

## 附：审计方法本身的坑（多帧 zstd）

排查事故时，我们踩过一个**方法论错误**，值得单独记：

- DSH 的 `session.v4.jsonl.zstd` 是**多帧拼接**的；
- Node 的 `zlib.zstdDecompressSync()` 只解**第一帧**——一个 489 KB 的日志只解出 260 字节（只有 header）；
- 因此“搜不到错误”并不代表没有错误。

正确做法：按 zstd 帧魔数 `28 b5 2f fd` 拆分后逐帧解压：

```js
const MAGIC = Buffer.from('28b52ffd', 'hex')
// 找出所有帧起点 → 逐个 zstdDecompressSync(buf.subarray(start, end))
```

重扫 43 个会话后，我们才看到真实的结构化错误（4 次 `turn/end` 错误）。

> 通用教训：**审计脚本本身也要验证**。先确认“能解出已知的样本”，再相信“0 命中”。

---

## 预防清单（贴在项目里）

- [ ] app 安装目录在工作区之外
- [ ] 不改工作区/子目录的 ACL、完整性标签
- [ ] profile `node_modules` 只有手动 Junction，无 `@deepseek-ai/*`
- [ ] 装插件优先官方渠道；装完检查依赖闭包
- [ ] 每次升级后跑回归（新建会话 + 老会话 + 关键工具）
- [ ] 日志审计脚本先验证样本，再下“没有错误”的结论
- [ ] 任何配置改动先备份、记录回滚
