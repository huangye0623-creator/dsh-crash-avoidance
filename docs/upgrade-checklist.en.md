> [中文](upgrade-checklist.md) | English

# DSH Upgrade Regression Checklist (mandatory for developer preview builds)

> DSH is in developer preview and **breaking changes will keep coming**. Use this checklist before and after every upgrade to catch "silent failures".

---

## 1. Before upgrading

- [ ] Record the current version (app version / `dsh --version` / the version in `package.json`)
- [ ] Back up the profile: `package.json`, `cordis.patch.yml`, `pnpm-lock.yaml` (if present)
- [ ] Back up your own plugin entities (the copy in the workspace)
- [ ] Record the current contents of `node_modules` (it should contain only manual junctions)
- [ ] Confirm the update package version and source; do not click "install update" in the middle of work
- [ ] Decide the rollback path up front: old installer / backups / config restore

## 2. After upgrading (10 minutes)

### A. Basics

- [ ] The app starts and the version number matches expectations
- [ ] **Creating a new session** succeeds
- [ ] **Resuming an old session** succeeds
- [ ] No crash dumps (no `.dmp` for the corresponding exe in `CrashDumps`)

### B. Profile structure

```powershell
Get-ChildItem -Force "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules" |
  Select-Object Name, LinkType, Target
Test-Path "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\@deepseek-ai"
```

- [ ] Only manually junctioned plugin entities
- [ ] **No** `@deepseek-ai/*` core packages (if present → roll back immediately, see Incident B)

### C. Key features (per your own dependency list)

- [ ] Search: ask a simple question and confirm the **backend marker** matches expectations; then ask a complex question and confirm the quality
- [ ] MCP: call a read-only tool (such as `get_me`) to confirm connectivity
- [ ] Team/sub-agents: dispatch a minimal task and confirm it returns
- [ ] Custom plugins: read their loading log and run one end-to-end behavior verification (**do not just look at `registered`**)
- [ ] Custom skills: visible in the skills directory; loadable by name

### D. Logs and errors

- [ ] No new "bursts of `already registered`" in the event log
- [ ] No `WEB_PROVIDER_AMBIGUOUS`
- [ ] No new `MALFORMED_RESPONSE` / other error codes on `turn/end`

> Note: session logs are **multi-frame zstd**, and ordinary decompression only yields the first frame; use the method below to see all events.

## 3. Decoding multi-frame zstd session logs

DSH's `session.v4.jsonl.zstd` is **several zstd frames concatenated**. Node's `zlib.zstdDecompressSync()` only decompresses the first frame (measured: 489 KB yielded only a 260-byte header).

Split on the frame magic `28 b5 2f fd` and decompress frame by frame:

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

Then count only **structured events** (`type === "turn/end"` with `reason.kind === "error"`); do not be misled by strings of the same name appearing in documents or conversations.

## 4. Rollback when something goes wrong

1. Close the app (the process locks files);
2. Restore the profile backups (`package.json` / `cordis.patch.yml` / `node_modules`);
3. Install the old version back if needed;
4. Restart → verify both a new session and an old session;
5. Write the symptom, version, and the original error text into the handover log (for next time).

## 5. Turn this checklist into a habit

- Upgrading is not just "one click", especially with self-written plugins or self-modified config;
- A 10-minute regression after each upgrade is cheaper than half a day of troubleshooting afterwards;
- Write the "applicable version + verification date" into your plugin's README / config comments.
