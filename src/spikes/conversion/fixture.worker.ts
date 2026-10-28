import { createFixtureFrame, fingerprint } from './fixtures'
import type { FixtureRequest, FixtureResponse } from './fixtures'
import { validateCanonicalMetadata } from '../../conversion/model'

globalThis.addEventListener('message', (event: MessageEvent<FixtureRequest>) => {
  const request = event.data
  try {
    if (request.type === 'generate') {
      const { width, height, count, playCount } = request.options
      validateCanonicalMetadata({ width, height, frameCount: count, playCount })
      const frame = createFixtureFrame(request.options, request.index)
      globalThis.postMessage({ id: request.id, type: 'frame', frame, fingerprint: fingerprint(frame, width, height) } satisfies FixtureResponse, { transfer: [frame.rgba] })
    } else {
      const { width, height } = request.metadata
      const value = fingerprint(request.frame, width, height)
      // Only scalar fingerprints return. This task retains no RGBA after acknowledgment.
      globalThis.postMessage({ id: request.id, type: 'fingerprint', fingerprint: value } satisfies FixtureResponse)
    }
  } catch {
    globalThis.postMessage({ id: request.id, type: 'error' } satisfies FixtureResponse)
  }
})
