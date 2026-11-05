import { BackendError, policy } from './policy.mjs'
// A cancellable coordinator, independent of every AniView production session.
export class SevenZipBackend {
  #worker; #generation = 0; #request = 0; #pending = new Map(); #limits
  #trace = []; #started = performance.now()
  metrics = { workersCreated: 0, workersTerminated: 0, activeWorkers: 0, staleMessages: 0 }
  constructor(values) { this.#limits = policy(values) }
  #log(event, details = {}) {
    this.#trace.push({ event, elapsedMs: Math.round(performance.now() - this.#started), generation: this.#generation, ...details })
    if (this.#trace.length > 100) this.#trace.shift()
  }
  #stop(code = 'ARCHIVE_CANCELLED') {
    if(this.#worker)this.#log('worker-terminated',{code})
    this.#generation++
    if (this.#worker) { this.#worker.terminate(); this.#worker = undefined; this.metrics.workersTerminated++; this.metrics.activeWorkers-- }
    for (const p of this.#pending.values()) { clearTimeout(p.timer); p.reject(new BackendError(code)) }
    this.#pending.clear()
  }
  #start() {
    this.#stop(); const generation = this.#generation
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' })
    this.#worker = worker; this.metrics.workersCreated++; this.metrics.activeWorkers++
    this.#log('worker-created')
    worker.onmessage = ({ data }) => {
      if (generation !== this.#generation || data.generation !== generation) { this.metrics.staleMessages++; return }
      const p = this.#pending.get(data.requestId); if (!p) return
      if (data.type === 'PROGRESS') { this.#log('phase',{phase:data.phase,...data.detail});p.progress?.(data.phase); return }
      clearTimeout(p.timer); this.#pending.delete(data.requestId)
      if (data.type === 'ERROR') {this.#log('request-error',{code:data.code});p.reject(new BackendError(data.code))}
      else {this.#log('request-complete');p.resolve(data.result)}
    }
    worker.onerror = e => {
      e.preventDefault()
      const category=/fetch|network|load.*module/i.test(e.message??'')?'NETWORK_OR_MODULE':/compileerror/i.test(e.message??'')?'WASM_COMPILE':/runtimeerror|unreachable|memory access/i.test(e.message??'')?'WASM_RUNTIME':'UNKNOWN'
      this.#log('worker-error',{category});this.#stop('ARCHIVE_BACKEND_ERROR')
    }
  }
  #send(type, payload = {}, progress) {
    if (!this.#worker) return Promise.reject(new BackendError('ARCHIVE_CLOSED'))
    const requestId = ++this.#request, generation = this.#generation
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {this.#log('deadline',{operation:type});this.#stop('ARCHIVE_TIMEOUT')}, this.#limits.maxOperationMs)
      this.#pending.set(requestId, { resolve, reject, timer, progress })
      this.#log('request-sent',{operation:type})
      this.#worker.postMessage({ type, requestId, generation, ...payload })
    })
  }
  async open(source, options = {}, progress) { this.#start(); try { return await this.#send('OPEN', { source, options, limits: this.#limits }, progress) } catch (e) { this.#stop(); throw e } }
  listEntries() { return this.#send('LIST') }
  extractEntry(entryId, options = {}, progress) { return this.#send('EXTRACT', { entryId, options }, progress) }
  getMetrics() { return { ...this.metrics } }
  getTrace() { return this.#trace.map(e=>({...e})) }
  nativeMetrics() { return this.#send('METRICS') }
  probeAllocation(bytes) { return this.#send('PROBE_ALLOC', { bytes }) }
  // Fault injection for synthetic fixtures only. No production caller exists.
  probeNativeExtraction(entryId) { return this.#send('PROBE_NATIVE_EXTRACT', { entryId }) }
  async cancel() { this.#stop() }
  async close() { this.#stop() }
}
