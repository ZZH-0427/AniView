/** One task boundary per checkpoint, without nested timer clamping. */
export function createWorkerTaskYield() {
  let channel: MessageChannel | undefined
  try { if (typeof MessageChannel === 'function') channel = new MessageChannel() }
  catch { /* A restricted runtime can still use the timer compatibility path. */ }
  let pending: { resolve: () => void; reject: (cause: Error) => void } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  const complete = () => {
    const current = pending
    pending = undefined; timer = undefined
    current?.resolve()
  }
  if (channel) channel.port1.onmessage = complete
  return {
    yield: (): Promise<void> => new Promise((resolve, reject) => {
      if (closed) { reject(new Error('Worker task yield is closed')); return }
      if (pending) { reject(new Error('Worker task yield already pending')); return }
      pending = { resolve, reject }
      // Repeated setTimeout(0) checkpoints inherit the browser's nested-timer
      // minimum delay. A port message yields a real task, so control messages
      // can still cancel the job, without inserting that timer floor per phase.
      if (channel) channel.port2.postMessage(null)
      else timer = setTimeout(complete, 0)
    }),
    close: () => {
      if (closed) return
      closed = true
      if (timer !== undefined) clearTimeout(timer)
      if (channel) { channel.port1.onmessage = null; channel.port1.close(); channel.port2.close() }
      const current = pending; pending = undefined
      current?.reject(new Error('Worker task yield is closed'))
    },
  }
}
