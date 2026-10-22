# DSH 升级回归清单（开发者预览版必做）

> 中文 | [English](upgrade-checklist.en.md)

> DSH 处于 developer preview，**破坏性变更会继续出现**。这份清单用于每次升级前后，把“静默失效”抓出来。

---

## 1. 升级前

- [ ] 记录当前版本（app 版本 / `dsh --version` / `package.json` 里的 version）
- [ ] 备份 profile：`package.json`、`cordis.patch.yml`、`pnpm-lock.yaml`（如有）
- [ ] 备份自己的插件实体（工作区里那份）
- [ ] 记录 `node_modules` 当前内容（应只有手动 Junction）
- [ ] 确认更新包版本与来源，别在干活时点“安装更新”
- [ ] 想清楚回滚方式：旧安装包 / 备份 / 配置还原

## 2. 升级后（10 分钟）

### A. 基础

- [ ] app 能启动，版本号符合预期
- [ ] **新建会话**成功
- [ ] **恢复一个老会话**成功
- [ ] 没有崩溃转储（`CrashDumps` 里没有对应 exe 的 `.dmp`）

### B. Profile 结构

```powershell
Get-ChildItem -Force "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules" |
  Select-Object Name, LinkType, Target
Test-Path "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\@deepseek-ai"
```

- [ ] 只有手动 Junction 的插件实体
- [ ] **没有** `@deepseek-ai/*` 核心包（有 → 立即回滚，见事故 B）

### C. 关键功能（按你自己的依赖清单）

- [ ] 搜索：搜一个简单问题，确认**后端标记**符合预期；再搜一个复杂问题，确认质量
- [ ] MCP：调用一个只读工具（如 `get_me`）确认连通
- [ ] Team/子智能体：派一个最小任务，确认能返回
- [ ] 自定义插件：看它的加载日志 + 做一次端到端行为验证（**不要只看 registered**）
- [ ] 自定义技能：技能目录里能看到；能按名字加载

### D. 日志与错误

- [ ] 事件日志里没有新增“成串的 `already registered`”
- [ ] 没有 `WEB_PROVIDER_AMBIGUOUS`
- [ ] `turn/end` 没有新增 `MALFORMED_RESPONSE` / 其他错误码

> 注意：会话日志是**多帧 zstd**，普通解压只拿到第一帧；用下面的方法才能看到全部事件。

## 3. 多帧 zstd 会话日志解码

DSH 的 `session.v4.jsonl.zstd` 是**多个 zstd 帧拼接**。Node 的 `zlib.zstdDecompressSync()` 只解第一帧（实测 489 KB 只解出 260 字节 header）。

按帧魔数 `28 b5 2f fd` 拆分后逐帧解压：

```js
const fs = require('node:fs')
const zlib = require('node:zlib')

function decodeAll(file) {
  const b = fs.readFileSync(file)
  const MAGIC = Buffer.from('28b52ffd', 'hex')
  const offs = []
  let pos = 0
  while ((pos = b.indexOf(MAGIC, pos)) !== -1) { offs.push(pos); pos += 4 }
  if (!offs.length) return ''
  offs.push(b.length)
  let out = ''
  for (let i = 0; i < offs.length - 1; i++) {
    try { out += zlib.zstdDecompressSync(b.subarray(offs[i], offs[i + 1])).toString('utf8') } catch {}
  }
  return out
}
```

然后只统计**结构化事件**（`type === "turn/end"` 且 `reason.kind === "error"`），不要被文档/对话里出现的同名字符串误导。

## 4. 出问题时的回滚

1. 关闭 app（进程锁文件）；
2. 还原 profile 备份（`package.json` / `cordis.patch.yml` / `node_modules`）；
3. 需要时安装回旧版本；
4. 重启 → 新建会话 + 老会话双验证；
5. 把现象、版本、错误原文写进交接记录（便于下次）。

## 5. 把这份清单变成习惯

- 升级不是“点一下”就完，尤其是有自写插件/自改配置时；
- 每次升级后 10 分钟回归，比事后排查半天便宜；
- 把“适用版本 + 验证日期”写进你的插件 README / 配置注释。
