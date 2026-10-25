// Original procedural source images; no downloaded art or image-codec dependency.
// This function is serialized into the installed browser by the local fixture tool.
export async function renderFixtures(spec) {
  const { count, width, height, kind = 'flat', type = 'image/png', prefix = 'frame' } = spec
  const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d'), files = []
  for (let frame = 0; frame < count; frame++) {
    ctx.clearRect(0, 0, width, height)
    if (kind === 'solid') {
      ctx.fillStyle = ['#e02632', '#20ba58', '#2e50df'][frame % 3]; ctx.fillRect(0, 0, width, height)
    } else if (kind === 'transparent') {
      const pixels = ctx.createImageData(width, height)
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.data.set([20, 220, 50, [0,127,128,255][x % 4]], (y * width + x) * 4)
      ctx.putImageData(pixels, 0, 0)
    } else if (kind === 'flat') {
      ctx.fillStyle = '#4985c8'; ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#c6dba4'; ctx.fillRect(0, height * .75, width, height * .25)
      ctx.fillStyle = '#243047'; ctx.beginPath(); ctx.ellipse(width * .5, height * .48, width * .23, height * .4, 0, 0, Math.PI * 2); ctx.fill()
      const skin = ctx.createLinearGradient(0, height * .2, width * .7, height * .8); skin.addColorStop(0, '#ffe3c5'); skin.addColorStop(1, '#edb292')
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(width * .5, height * .46, width * .18, height * .28, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#243047'; ctx.beginPath(); ctx.moveTo(width * .29, height * .36); ctx.lineTo(width * .48, height * .09); ctx.lineTo(width * .7, height * .36); ctx.lineTo(width * .56, height * .3); ctx.lineTo(width * .48, height * .42); ctx.lineTo(width * .44, height * .27); ctx.closePath(); ctx.fill()
      ctx.lineWidth = Math.max(1, width / 100); ctx.strokeStyle = '#222339'
      for (const x of [.43,.58]) { ctx.beginPath(); ctx.ellipse(width * x, height * .47, width * .025, height * (.025 + (frame % 3) * .008), 0, 0, Math.PI * 2); ctx.stroke() }
      ctx.beginPath(); ctx.arc(width * .5, height * .59, width * .045, 0, Math.PI); ctx.stroke()
      ctx.fillStyle = '#ee8979'; ctx.beginPath(); ctx.moveTo(width * .28, height); ctx.lineTo(width * .36, height * .73); ctx.lineTo(width * .64, height * .73); ctx.lineTo(width * .72, height); ctx.fill()
      ctx.fillStyle = '#f7e1af'; ctx.fillRect(width * (.05 + frame % 3 * .02), height * .1, width * .12, height * .08)
    } else if (kind === 'gradient') {
      const gradient = ctx.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, '#16285c'); gradient.addColorStop(.35, '#9e71bc'); gradient.addColorStop(.7, '#f3cda0'); gradient.addColorStop(1, '#e6f0c4')
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
      const glow = ctx.createRadialGradient(width * .3, height * .4, 0, width * .3, height * .4, width * .6)
      glow.addColorStop(0, '#f7b77ba8'); glow.addColorStop(1, '#607b2300'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height)
    } else {
      const image = ctx.createImageData(width, height); let random = 0x45abc391 + frame
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        random ^= random << 13; random ^= random >>> 17; random ^= random << 5; const noise = (random >>> 0) / 0xffffffff - .5
        random ^= random << 13; random ^= random >>> 17; random ^= random << 5; const green = (random >>> 0) / 0xffffffff - .5
        random ^= random << 13; random ^= random >>> 17; random ^= random << 5; const blue = (random >>> 0) / 0xffffffff - .5
        const xx = x / width, yy = y / height, ridge = .53 + Math.sin(xx * 11 + frame * .05) * .075 + Math.sin(xx * 29) * .025
        const ground = yy > ridge, shade = .5 + Math.sin(xx * 50 + yy * 31) * .1, i = (y * width + x) * 4
        image.data[i] = ground ? 58 + shade * 70 + noise * 70 + xx * 40 : 70 + yy * 150 + noise * 12
        image.data[i + 1] = ground ? 83 + shade * 77 + green * 65 : 120 + yy * 100 + green * 12
        image.data[i + 2] = ground ? 36 + shade * 60 + blue * 65 + (1 - xx) * 35 : 187 + yy * 45 + blue * 12
        image.data[i + 3] = 255
      }
      ctx.putImageData(image, 0, 0)
    }
    const blob = await canvas.convertToBlob({ type, quality: .92 })
    if (blob.type !== type) throw new Error('Native fixture encoder unavailable: ' + type)
    const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob) })
    files.push({ name: `${prefix}-${String(frame + 1).padStart(3, '0')}.${type === 'image/jpeg' ? 'jpg' : type.split('/')[1]}`, type, base64 })
  }
  canvas.width = 1; canvas.height = 1
  return files
}
