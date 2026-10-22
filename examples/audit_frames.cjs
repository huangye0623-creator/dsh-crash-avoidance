// 多帧 zstd 会话日志解码/审计（只读）
// 用法：node audit_frames.cjs [sessions目录]
// 默认目录：%USERPROFILE%\.dsh\sessions
// 说明：DSH 的 session.v4.jsonl.zstd 是多帧拼接；普通 zstdDecompressSync 只解第一帧。
//       本脚本按帧魔数 28 b5 2f fd 拆分后逐帧解压，只统计结构化错误，不被文档里的同名字符串误导。

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const ROOT = process.argv[2] || path.join(process.env.USERPROFILE || '', '.dsh', 'sessions')
const MAGIC = Buffer.from('28b52ffd', 'hex')

function decodeFrames(file) {
  const b = fs.readFileSync(file)
  let pos = 0
  const offs = []
  while ((pos = b.indexOf(MAGIC, pos)) !== -1) {
    offs.push(pos)
    pos += 4
  }
  if (!offs.length) return ''
  offs.push(b.length)
  const out = []
  for (let i = 0; i < offs.length - 1; i++) {
    try {
      out.push(zlib.zstdDecompressSync(b.subarray(offs[i], offs[i + 1])).toString('utf8'))
    } catch {
      // 跳过损坏/伪帧
    }
  }
  return out.join('')
}

const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.zstd')) files.push(p)
  }
})(ROOT)

const errors = []
for (const f of files) {
  const txt = decodeFrames(f)
  for (const line of txt.split('\n')) {
    if (!line.startsWith('{') || !line.includes('"type":"turn/end"')) continue
    try {
      const ev = JSON.parse(line)
      if (ev?.data?.reason?.kind !== 'error') continue
      errors.push({
        session: path.basename(path.dirname(f)),
        time: ev.time ?? null,
        code: ev.data.reason.error?.code ?? '?',
        message: String(ev.data.reason.error?.message ?? '').slice(0, 160),
      })
    } catch {}
  }
}

console.log(`会话文件 ${files.length} 个；turn/end 错误 ${errors.length} 个`)
for (const e of errors) {
  const d = e.time ? new Date(e.time).toISOString().replace('T', ' ').slice(0, 19) : '?'
  console.log(`- ${d}  ${e.code}  @${e.session}`)
  console.log(`    ${e.message}`)
}
