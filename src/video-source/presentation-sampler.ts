import { VideoInputError } from './model'
export interface TimedSample { readonly timestamp: number; readonly duration: number; close(): void }
interface Held<T> { sample:T; ticks:bigint; closed?:boolean }
/** Match the integer-µs grid/native clock, avoiding sub-µs same-FPS boundary aliasing. */
export function presentationUs(ticks:bigint,origin:bigint,resolution:number){
  const denominator=2n*BigInt(resolution),numerator=2n*(ticks-origin)*1_000_000n+BigInt(resolution)
  const quotient=numerator/denominator
  return numerator<0n&&numerator%denominator!==0n?quotient-1n:quotient
}
/** Only borrowed current + one lookahead; codec order/reordering remains Mediabunny's job. */
export class PresentationSampler<T extends TimedSample> {
  private current:Held<T>|undefined
  private lookahead:Held<T>|undefined
  private ended=false
  private closed=false
  private lastTicks:bigint|undefined
  private lastQuery:bigint|undefined
  constructor(private readonly iterator:AsyncIterator<T>,private readonly resolution:number,
    private readonly acquired:(sample:T)=>void=()=>{},private readonly released:(failed:boolean)=>void=()=>{}){}
  private release(held:Held<T>|undefined){
    if(!held||held.closed)return
    held.closed=true
    let failed=false
    try{held.sample.close()}catch{failed=true}finally{this.released(failed)}
  }
  private async read():Promise<Held<T>|undefined>{
    if(this.ended)return
    const value=await this.iterator.next()
    if(value.done){this.ended=true;return}
    const sample=value.value
    try{this.acquired(sample)}catch(error){this.release({sample,ticks:0n});throw error}
    if(this.closed){this.release({sample,ticks:0n});throw new VideoInputError('CANCELLED')}
    const ticks=Math.round(sample.timestamp*this.resolution)
    if(!Number.isSafeInteger(ticks)||!Number.isFinite(sample.duration)||sample.duration<0
      ||(this.lastTicks!==undefined&&BigInt(ticks)<this.lastTicks)){
      this.release({sample,ticks:0n});throw new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
    }
    this.lastTicks=BigInt(ticks);return{sample,ticks:BigInt(ticks)}
  }
  async select(relativeUs:number,visibleStartTicks:number):Promise<T>{
    const query=BigInt(relativeUs),origin=BigInt(visibleStartTicks)
    if(this.closed)throw new VideoInputError('CANCELLED')
    if(this.lastQuery!==undefined&&query<this.lastQuery)throw new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
    this.lastQuery=query
    this.current??=await this.read()
    if(!this.current||presentationUs(this.current.ticks,origin,this.resolution)>query)throw new VideoInputError('VIDEO_TIMELINE_UNSUPPORTED')
    while(true){
      this.lookahead??=await this.read()
      if(!this.lookahead||presentationUs(this.lookahead.ticks,origin,this.resolution)>query)break
      this.release(this.current);this.current=this.lookahead;this.lookahead=undefined
    }
    return this.current.sample
  }
  async close(){
    if(this.closed)return
    this.closed=true
    this.release(this.current);this.current=undefined
    this.release(this.lookahead);this.lookahead=undefined
    await this.iterator.return?.()
  }
}
