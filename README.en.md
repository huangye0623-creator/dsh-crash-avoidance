> [中文](README.md) | English

# DSH Crash Avoidance

> Postmortems of three real incidents plus an upgrade regression checklist. The goal is simple: **don't let the app fail to start, don't let every session break, and don't let an upgrade silently break plugins.**
>
> Unofficial · Anonymized · Docs CC BY 4.0

## Repository contents

| Content | Description |
|---|---|
| [docs/incident-postmortems.en.md](docs/incident-postmortems.en.md) | Three incidents: Windows ACL/integrity, profile double instance, preview API change; includes detection, rollback, prevention |
| [docs/upgrade-checklist.en.md](docs/upgrade-checklist.en.md) | 10-minute pre/post-upgrade regression checklist (including profile structure check) |
| [examples/audit_frames.cjs](examples/audit_frames.cjs) | Multi-frame zstd session log decoding/auditing (read-only) |

## The three most important rules

1. **The app install directory must be outside the workspace**; never bulk-change ACLs or integrity labels for the workspace or its subdirectories.
2. **A profile's `node_modules` may only contain manually junctioned plugin entities**; if `@deepseek-ai/*` core packages show up, that is a double-instance incident — roll back immediately.
3. **"Loaded successfully" does not mean "in use"**: after upgrading you must run end-to-end behavior verification (search, MCP, new/resume session).

## Quick start

- Already broken: check the symptom table in [docs/incident-postmortems.en.md](docs/incident-postmortems.en.md) first;
- About to upgrade: walk through [docs/upgrade-checklist.en.md](docs/upgrade-checklist.en.md);
- Inspecting logs: `node examples/audit_frames.cjs [sessions dir]` (defaults to `%USERPROFILE%\.dsh\sessions`).

## Scope and limits

- The conclusions are based on the author's environment and specific DSH versions; re-verify after upgrading;
- Contains no keys or personal data;
- Does not offer ways to "bypass DSH security mechanisms" — on the contrary, keeping the sandbox plus approvals is recommended.

## License

Docs CC BY 4.0; example scripts MIT ([LICENSE](LICENSE)). Unofficial; see [LEGAL.md](LEGAL.en.md) for details.

---

*Summary: postmortems of three real DSH incidents (Windows ACL/integrity, profile dependency duplication, preview API change), plus an upgrade regression checklist and a multi-frame zstd log audit script. Unofficial; anonymized. Docs CC BY 4.0, code MIT.*
