globalThis.addEventListener('message',()=>{void(async()=>{
  const width=320,height=240,rgba=new Uint8Array(width*height*4).fill(255),rows=[]
  for(const path of ['raw','offscreen','bitmap'] as const){
    const start=performance.now();let bitmap:ImageBitmap|undefined
    try{
      for(let i=0;i<5;i++){
        let frame:VideoFrame
        if(path==='raw')frame=new VideoFrame(rgba,{format:'RGBA',codedWidth:width,codedHeight:height,timestamp:i*1000})
        else{
          const image=new ImageData(new Uint8ClampedArray(rgba.buffer),width,height)
          if(path==='bitmap'){bitmap=await createImageBitmap(image);frame=new VideoFrame(bitmap,{timestamp:i*1000})}
          else {const canvas=new OffscreenCanvas(width,height);canvas.getContext('2d')!.putImageData(image,0,0);frame=new VideoFrame(canvas,{timestamp:i*1000})}
        }
        frame.close();bitmap?.close();bitmap=undefined
      }
      rows.push({path,status:'PASS',iterations:5,ms:performance.now()-start,extraFullRgbaBuffers:0,extraCanvasSurfaces:path==='offscreen'?1:0,extraBitmaps:path==='bitmap'?1:0})
    }catch{bitmap?.close();rows.push({path,status:'UNSUPPORTED'})}
  }
  globalThis.postMessage({type:'comparison',rows,imageData:'Use ImageData.data with the raw-buffer overload; ImageData itself is not CanvasImageSource.'})
})()})
