import { VIDEO_LIMITS, VideoError } from './model'
/** Compensated cumulative boundaries; canonical milliseconds remain unchanged. */
export class VideoTimeline {
  private sumMs = 0
  private correction = 0
  private boundaryUs = 0
  next(durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new VideoError('VIDEO_FRAME_FAILED')
    const adjusted = durationMs - this.correction, total = this.sumMs + adjusted
    const end = Math.round(total * 1000)
    if (!Number.isSafeInteger(end) || end > VIDEO_LIMITS.maxDurationUs) throw new VideoError('RESOURCE_LIMIT')
    if (end <= this.boundaryUs) throw new VideoError('VIDEO_FRAME_FAILED')
    const value = { timestampUs: this.boundaryUs, durationUs: end - this.boundaryUs }
    this.correction = (total - this.sumMs) - adjusted; this.sumMs = total; this.boundaryUs = end
    return value
  }
}
