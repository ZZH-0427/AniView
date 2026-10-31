import { createFixtureFrame } from '../conversion/fixtures'
import type { FixtureOptions } from '../conversion/fixtures'
import type { AnimationEncoder, ConversionFormat } from '../../conversion/model'
globalThis.addEventListener('message', (event: MessageEvent<{ format: ConversionFormat; options: FixtureOptions; photo?: boolean; softEdges?: boolean; photoData?:ArrayBuffer }>) => {
  void (async () => {
    let encoder: AnimationEncoder | undefined
    let photo:ImageBitmap|undefined
    try {
      const { options, format } = event.data, metadata = { width: options.width, height: options.height, frameCount: options.count, playCount: options.playCount }
      if(event.data.photoData)photo=await createImageBitmap(new Blob([event.data.photoData]))
      const canvas=photo?new OffscreenCanvas(options.width,options.height):undefined
      encoder = format === 'gif' ? new (await import('../../conversion/gif-encoder')).GIFAnimationEncoder(metadata)
        : format === 'webp' ? await (await import('../../conversion/webp-encoder')).WebPAnimationEncoder.create(metadata)
          : await (await import('../../conversion/apng-encoder')).APNGAnimationEncoder.create(metadata)
      for (let i = 0; i < options.count; i++) {
        const frame = createFixtureFrame(options, i)
        if(photo&&canvas){
          const context=canvas.getContext('2d')!;context.fillStyle='black';context.fillRect(0,0,canvas.width,canvas.height)
          context.drawImage(photo,i%4,0,canvas.width-4,canvas.height);new Uint8Array(frame.rgba).set(context.getImageData(0,0,canvas.width,canvas.height).data)
        }
        if (event.data.photo) {
          // Original smooth landscape/texture approximation, not a claimed real photo benchmark.
          const a = new Uint8Array(frame.rgba)
          for (let y=0;y<options.height;y++) for(let x=0;x<options.width;x++) {
            const at=(y*options.width+x)*4, noise=8*Math.sin(x*.43+y*.19+i), hill=y>options.height*(.55+.12*Math.sin(x/options.width*8+i*.2))
            a[at]=Math.max(0,Math.min(255,(hill?92:125)+noise+y/options.height*50));a[at+1]=(hill?130:175)+noise;a[at+2]=(hill?70:220)+noise;a[at+3]=255
          }
        }
        if(event.data.softEdges){
          const a=new Uint8Array(frame.rgba),cx=options.width*(.4+.1*Math.sin(i)),cy=options.height/2,radius=options.height*.3
          for(let y=0;y<options.height;y++)for(let x=0;x<options.width;x++){
            const at=(y*options.width+x)*4,d=Math.hypot(x-cx,y-cy)
            a[at]=200;a[at+1]=60;a[at+2]=80;a[at+3]=Math.round(Math.max(0,Math.min(1,(radius-d)/3+.5))*255)
          }
        }
        await encoder.addFrame(frame)
      }
      const result = await encoder.finish()
      photo?.close();photo=undefined
      globalThis.postMessage({ type: 'fixture', data: result.data, byteLength: result.byteLength }, { transfer: [result.data] })
    } catch { globalThis.postMessage({ type: 'error' }) } finally { photo?.close();encoder?.dispose() }
  })()
})
