# DSH Crash Avoidance（避免 DSH 崩溃）

> 中文 | [English](README.en.md)

> 三次真实事故的复盘 + 一份升级回归清单。目标很简单：**别让 app 起不来、别让所有会话都挂、别让升级悄悄弄坏插件。**
>
> 非官方 · 已匿名化 · 文档 CC BY 4.0

## 仓库内容

| 内容 | 说明 |
|---|---|
| [docs/incident-postmortems.md](docs/incident-postmortems.md) | 三次事故：Windows ACL/完整性、Profile 双实例、预览版 API 变更；含检测、回滚、预防 |
| [docs/upgrade-checklist.md](docs/upgrade-checklist.md) | 升级前后 10 分钟回归清单（含 Profile 结构检查） |
| [examples/audit_frames.cjs](examples/audit_frames.cjs) | 多帧 zstd 会话日志解码/审计（只读） |

## 三条最重要的规则

1. **app 安装目录必须在工作区之外**；不要给工作区/子目录批量改 ACL、完整性标签。
2. **Profile 的 `node_modules` 只允许手动 Junction 的插件实体**；出现 `@deepseek-ai/*` 核心包 = 双实例事故，立即回滚。
3. **“加载成功”不等于“被使用”**：升级后必须做端到端行为验证（搜索、MCP、新建/恢复会话）。

## 快速开始

- 已经出问题：先对照 [docs/incident-postmortems.md](docs/incident-postmortems.md) 的症状表；
- 准备升级：照 [docs/upgrade-checklist.md](docs/upgrade-checklist.md) 走一遍；
- 查日志：`node examples/audit_frames.cjs [sessions目录]`（默认 `%USERPROFILE%\.dsh\sessions`）。

## 适用边界

- 结论基于作者环境与特定 DSH 版本；升级后需重新验证；
- 不包含任何密钥/个人数据；
- 不提供“绕过 DSH 安全机制”的方法——相反，建议保持沙箱 + 审批。

## 许可证

文档 CC BY 4.0；示例脚本 MIT（[LICENSE](LICENSE)）。非官方；详见 [LEGAL.md](LEGAL.md)。

---

*English summary: postmortems of three real DSH incidents (Windows ACL/integrity, profile dependency duplication, preview API change), plus an upgrade regression checklist and a multi-frame zstd log audit script. Unofficial; anonymized. Docs CC BY 4.0, code MIT.*
