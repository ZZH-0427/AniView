import {validateCodedSize,VideoInputError} from './model'

export interface TrackSampleGeometry {
  codedWidth:number;codedHeight:number;displayWidth:number;displayHeight:number
  squarePixelWidth:number;squarePixelHeight:number;rotation:number;flip:boolean
}
export interface DecodedSampleGeometry {
  displayWidth:number;displayHeight:number;squarePixelWidth:number;squarePixelHeight:number
  rotation:number;flip:boolean;visibleRect:{left:number;top:number;width:number;height:number}
}

/** Validate each yielded sample; return true only for a missing native PAR adjustment. */
export function validateSampleGeometry(track:TrackSampleGeometry,sample:DecodedSampleGeometry):boolean {
  validateCodedSize(Math.ceil(sample.displayWidth),Math.ceil(sample.displayHeight))
  const rect=sample.visibleRect
  validateCodedSize(rect.width,rect.height)
  if(sample.rotation!==track.rotation||sample.flip!==track.flip)throw new VideoInputError('VIDEO_SOURCE_LIMIT')
  if(Math.abs(sample.displayWidth-track.displayWidth)<=1&&Math.abs(sample.displayHeight-track.displayHeight)<=1)return false

  // Quark/Chromium123 can acknowledge displayAspect* but return the unadjusted
  // full coded rectangle. Never infer PAR from that frame or waive crop/size
  // changes. Track geometry remains authoritative for the existing full-frame
  // sample.draw(ctx,0,0,outputWidth,outputHeight); no new frame/canvas is needed.
  const rotated=track.rotation%180!==0
  const expectedWidth=rotated?track.squarePixelHeight:track.squarePixelWidth
  const expectedHeight=rotated?track.squarePixelWidth:track.squarePixelHeight
  const explicitPar=track.squarePixelWidth*track.codedHeight!==track.squarePixelHeight*track.codedWidth
  const fullCodedRect=rect.left===0&&rect.top===0&&rect.width===track.codedWidth&&rect.height===track.codedHeight
  const unadjustedPixels=sample.squarePixelWidth===track.codedWidth&&sample.squarePixelHeight===track.codedHeight
  const unadjustedDisplay=sample.displayWidth===(rotated?track.codedHeight:track.codedWidth)
    &&sample.displayHeight===(rotated?track.codedWidth:track.codedHeight)
  if(!explicitPar||!fullCodedRect||!unadjustedPixels||!unadjustedDisplay
    ||track.displayWidth!==expectedWidth||track.displayHeight!==expectedHeight)throw new VideoInputError('VIDEO_SOURCE_LIMIT')
  return true
}
