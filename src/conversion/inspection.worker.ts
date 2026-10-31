// Decode-back consumes one transferred buffer at a time. It retains no pixels.
globalThis.addEventListener('message', (event: MessageEvent<{ id: number; rgba: ArrayBuffer }>) => {
  globalThis.postMessage({ id: event.data.id })
})
