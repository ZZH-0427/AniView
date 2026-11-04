import { describe, expect, it, vi } from 'vitest'
import gif from '../../tests/fixtures/gif/previous.gif?inline'
import apng from '../../tests/fixtures/apng/composition.png?inline'
import webp from '../../tests/fixtures/validation/viewer/long.webp?inline'
import png from '../../tests/fixtures/static/quadrants.png?inline'
import { inspectCreationOutput } from './output-validation'
import type { inspectConversionOutput } from '../conversion/output-inspection'
const inspect = vi.hoisted(() => vi.fn<typeof inspectConversionOutput>(async () => ({ width: 2, height: 1, frameCount: 2, playCount: 0, durationMs: 1000 })))
const bytes = (uri: string) => Uint8Array.from(atob(uri.split(',')[1]!), c => c.charCodeAt(0))
vi.mock('../conversion/output-inspection', () => ({ inspectConversionOutput: inspect }))
describe('creation actual binary readback boundary', () => {
  it.each([
    ['gif', gif], ['apng', apng], ['webp', webp],
  ] as const)('detects real %s bytes before invoking actual-output inspection', async (format, path) => {
    inspect.mockClear(); const signal = new AbortController().signal
    await inspectCreationOutput(new Blob([bytes(path)]), format, signal); expect(inspect).toHaveBeenCalledOnce(); expect(inspect.mock.calls[0]?.[1]).toBe(format)
  })
  it('rejects static and wrong-format outputs before inspection regardless of extension/MIME hints', async () => {
    inspect.mockClear()
    await expect(inspectCreationOutput(new Blob([bytes(png)], { type: 'image/gif' }), 'gif', new AbortController().signal)).rejects.toMatchObject({ code: 'TARGET_ENCODE_FAILED' })
    await expect(inspectCreationOutput(new Blob([bytes(gif)]), 'webp', new AbortController().signal)).rejects.toMatchObject({ code: 'TARGET_ENCODE_FAILED' })
    expect(inspect).not.toHaveBeenCalled()
  })
})
