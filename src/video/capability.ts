import type { ProbeResult } from './model'

export function avcConfigs(width: number, height: number): VideoEncoderConfig[] {
  // A 30fps reference workload sets bitrate/level capacity, not a CFR timestamp grid.
  const bitrate = Math.round(Math.max(500_000, Math.min(20_000_000, width * height * 30 * .18)))
  const blocks = Math.ceil(width / 16) * Math.ceil(height / 16)
  const level = blocks <= 3600 && bitrate <= 14_000_000 ? '1f' : blocks <= 8192 ? '28' : '32'
  return ['42e0', '4d00', '6400'].map(profile => ({ codec: `avc1.${profile}${level}`, width, height, bitrate,
    hardwareAcceleration: 'no-preference', latencyMode: 'quality', avc: { format: 'avc' } }))
}
export async function probeAvc(width: number, height: number,
  api: Pick<typeof VideoEncoder, 'isConfigSupported'> | undefined = typeof VideoEncoder === 'undefined' ? undefined : VideoEncoder): Promise<ProbeResult> {
  if (!api || typeof VideoFrame === 'undefined') return { apiPresent: false, candidates: [], selected: null }
  const candidates = []
  for (const config of avcConfigs(width, height)) {
    let supported = false
    try { supported = (await api.isConfigSupported(config)).supported === true } catch { /* Exact candidate unsupported. */ }
    candidates.push({ config, supported })
  }
  return { apiPresent: true, candidates, selected: candidates.find(x => x.supported)?.config ?? null }
}
