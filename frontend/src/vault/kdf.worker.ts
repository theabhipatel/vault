/// <reference lib="webworker" />
// Runs Argon2id off the main thread so the UI stays responsive during the ~1 s derivation.
import { deriveKeyBytes } from "./crypto"
import type { KdfParams } from "./crypto"

interface Request {
  id: number
  password: string
  params: KdfParams
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, password, params } = event.data
  try {
    const started = performance.now()
    const key = await deriveKeyBytes(password, params)
    const ms = performance.now() - started
    // Transfer (not copy) the buffer so no stray copy of the key stays in the worker.
    self.postMessage({ id, key, ms }, [key.buffer])
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "Key derivation failed" })
  }
}
