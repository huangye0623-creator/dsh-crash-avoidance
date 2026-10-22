> [中文](incident-postmortems.md) | English

# Postmortems of Three Real Incidents (Windows + DSH Preview Builds)

> None of these three were "DSH code bugs" — they were caused by **operations / environment / preview-build changes**. The value of a postmortem is learning how to recognize the symptoms, how to roll back, and how to prevent the next one.
> Anonymized; versions and dates are kept for cross-reference.

---

## Incident A: Changed workspace permissions/integrity → app would not open

**Time**: 2026-10-13
**Environment**: Windows, DSH desktop build was installed **inside the workspace directory** at that time

### Symptoms

- After restarting DSH the window would not come up; crash log: `Desktop renderer exited: launch-failed`, exit code `0x80000003`;
- At the same time, a "bulk-change integrity labels/permissions across the directory tree" operation had been performed on the workspace.

### Root cause

- To fix "workspace write permissions", a **Low integrity label** was set on the workspace tree;
- But **the app itself was installed inside the workspace**, so the label was inherited down to `DeepSeek Harness.exe`;
- The Electron renderer process failed to be created in a low-integrity directory → the app could not start.

> Key insight: **a workspace is where the AI reads and writes, not where programs are installed.** The program body and the workspace must be physically isolated.

### Fix

1. Restore workspace permissions/integrity (`icacls "<workspace>" /reset`, set integrity back to `Medium`);
2. **Move the app outside the workspace** (for example `%LOCALAPPDATA%\Programs\...`);
3. Recreate/fix the shortcuts;
4. Re-verify: the process starts and there are no new crash logs.

### Prevention (written into the rules)

- Never bulk-modify the **permissions/integrity/owner** of the workspace or its subdirectories in an agent session;
- If a change is truly needed: back up first with `icacls "<path>" /save <file>`, and state which directories will be affected;
- Before any "bulk attribute change", confirm that **no running program body is inside the workspace**;
- Keep the program install directory physically isolated from the agent workspace.

> Later DSH versions provide a Windows sandbox ACL diagnostic skill (`diagnose-windows-sandbox-acl`) and related plugins that help **diagnose/fix** this class of problem, but they **do not automatically prevent** you from changing ACLs.

---

## Incident B: A "second copy of the core packages" got installed into the profile → all sessions failed to start

**Time**: late night, 2026-10-13
**Trigger**: to make an official MCP package resolvable, an install with `auto-install-peers` was run in the profile directory

### Symptoms

- **Creating a new session and resuming a session both failed**;
- The error output had `prompt section "..." is already registered` / `tool "..." is already registered` **for almost every plugin**.

### Root cause

- The install put **39 packages** (including 24 `@deepseek-ai/*` core packages) into `profiles/<profile>/node_modules/`;
- The app ships its own copy of the core packages and the profile had another → **the same plugin was loaded twice** → duplicate registration was rejected by the loader → runtime construction failed.

### How to tell quickly

| Symptom | Conclusion |
|---|---|
| Only one plugin is broken | It is a problem with that plugin |
| **Almost every plugin reports already registered** | **Everything is being mounted twice**; check the profile's `node_modules` first |

Check:

```powershell
Get-ChildItem -Force "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules" |
  Select-Object Name, LinkType, Target
Test-Path "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\@deepseek-ai"
```

- Normal: `node_modules` should contain **only manually junctioned plugin entities**;
- As soon as `@deepseek-ai/*` core packages appear → roll back as described below.

### Rollback

1. Close the app (the process locks files);
2. Back up `package.json`, `cordis.patch.yml`, `pnpm-lock.yaml`;
3. Delete the profile's `node_modules` and `pnpm-lock.yaml`;
4. Restore `dependencies` / `dsh.profile.bundles` in `package.json`;
5. Restart the app → verify **both a new session and resuming an old session**.

### The right way to wire plugins in (three cases, pick by plugin source)

| Plugin type | Correct approach |
|---|---|
| Official plugin **bundled with the app** | Register it in the profile's `cordis.patch.yml` with an **`insert:`** block (no installation needed) |
| **Your own** local plugin | `dsh.profile.bundles` + `dependencies: "file:<absolute ASCII path>"` in `package.json` + create a junction in `node_modules` |
| A plugin **on npm** | Prefer the official plugin manager / `dsh plugin add`; do not hand-run `pnpm add` |

> Rule: **a profile's `node_modules` may only contain "manually junctioned plugin entities"**; `@deepseek-ai/*` core packages are not allowed.

---

## Incident C: Preview-build API change → the plugin "loaded successfully but was never used"

**Time**: 2026-10-22 (DSH `0.2.1-rc.2`)
**Background**: A self-written search plugin relied on the public property `ctx.web.searchProviderId` to "pin" the search provider

### Symptoms

- The plugin log says `registered`; everything looks fine;
- But the search behavior/results differ from expectations (for example, the expected summary answer is missing);
- The plugin behaves "as if it were not installed".

### Root cause

- The new version switched routing to `config.searchProvider` (or an environment variable) and **the `searchProviderId` property was removed**;
- The plugin still assigned to a property "nobody reads" → routing never changed → **silent failure**.

### How to locate it (general approach)

1. Read the loading log: registration success ≠ being used;
2. Look at **behavioral differences**, not just logs;
3. Use `file:line` to compare against the source of the current version (package sources inside `app.asar` are readable);
4. Compare the APIs of the old and new versions;
5. After fixing, run a behavior verification again (do not just check status).

### Fix

- Explicitly override the routing config in the profile's `cordis.patch.yml` (override by id; note that this is a **whole-block replacement**, so include the necessary fields);
- Record the "applicable version"; re-run the regression after upgrading (see `upgrade-checklist.md`).

### Lessons

- DSH is in **developer preview**; breaking changes will keep coming;
- Plugins should do **compatibility probing** (probe capabilities at runtime instead of hard-coding versions/properties);
- Any "loaded successfully" must be paired with an **end-to-end behavior verification**.

---

## Appendix: A pitfall in the audit method itself (multi-frame zstd)

While investigating incidents we hit a **methodological error** worth recording separately:

- `session.v4.jsonl.zstd` in DSH is **multiple concatenated frames**;
- Node's `zlib.zstdDecompressSync()` only decompresses **the first frame** — a 489 KB log decompressed to just 260 bytes (the header only);
- So "the error cannot be found" does not mean there is no error.

The correct approach: split on the zstd frame magic `28 b5 2f fd` and decompress frame by frame:

```js
const MAGIC = Buffer.from('28b52ffd', 'hex')
// find every frame start → zstdDecompressSync(buf.subarray(start, end)) one by one
```

After re-scanning 43 sessions, we finally saw the real structured errors (4 `turn/end` errors).

> General lesson: **the audit script itself must be verified too**. First confirm that "it can decode a known sample", then trust "0 hits".

---

## Prevention checklist (pin this in the project)

- [ ] The app install directory is outside the workspace
- [ ] No changes to the ACLs or integrity labels of the workspace or its subdirectories
- [ ] Profile `node_modules` contains only manual junctions, no `@deepseek-ai/*`
- [ ] Install plugins through official channels first; check the dependency closure afterwards
- [ ] Run the regression after every upgrade (new session + old session + key tools)
- [ ] Verify a sample with the log audit script first, then conclude "no errors"
- [ ] Back up and record the rollback path before any config change
