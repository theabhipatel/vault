import { KDF_MIB, MIN_KDF, deriveKeyBytes, newKdfParams, wipe } from "./crypto"
import type { KdfParams } from "./crypto"

interface Reply {
  id: number
  key?: Uint8Array
  ms?: number
  error?: string
}

let worker: Worker | null = null
let nextId = 0
const waiting = new Map<number, (reply: Reply) => void>()

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null
  if (!worker) {
    worker = new Worker(new URL("./kdf.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<Reply>) => {
      waiting.get(e.data.id)?.(e.data)
      waiting.delete(e.data.id)
    }
  }
  return worker
}

async function timedDerive(password: string, params: KdfParams): Promise<{ key: Uint8Array; ms: number }> {
  const w = getWorker()
  if (!w) {
    const started = performance.now()
    const key = await deriveKeyBytes(password, params)
    return { key, ms: performance.now() - started }
  }
  const id = ++nextId
  const reply = await new Promise<Reply>((resolve) => {
    waiting.set(id, resolve)
    w.postMessage({ id, password, params })
  })
  if (reply.error || !reply.key) throw new Error(reply.error ?? "Key derivation failed")
  return { key: reply.key, ms: reply.ms ?? 0 }
}

/** Argon2id in a Web Worker. */
export async function derive(password: string, params: KdfParams): Promise<Uint8Array> {
  return (await timedDerive(password, params)).key
}

const TARGET_MS = 1000
const MAX_MEM = 256 * KDF_MIB
const MAX_OPS = 10

/**
 * Choose Argon2id parameters that take roughly one second on this device, never below the
 * required 64 MiB / 3 iterations. Memory is raised first (up to 256 MiB), then iterations.
 */
export async function calibrateKdf(): Promise<KdfParams> {
  let mem: number = MIN_KDF.mem
  let ops: number = MIN_KDF.ops
  let { key, ms } = await timedDerive("calibration", newKdfParams(ops, mem))
  wipe(key)
  while (ms < TARGET_MS / 2.2 && mem < MAX_MEM) {
    mem *= 2
    ;({ key, ms } = await timedDerive("calibration", newKdfParams(ops, mem)))
    wipe(key)
  }
  if (ms > 0 && ms < TARGET_MS * 0.8) {
    ops = Math.min(MAX_OPS, Math.max(MIN_KDF.ops, Math.round((ops * TARGET_MS) / ms)))
  }
  return newKdfParams(ops, mem)
}
