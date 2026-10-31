import { expect,it } from 'vitest'
import { PresentationSampler,presentationUs } from './presentation-sampler'
import { offsetUs } from './sampling-plan'
function fixture(times:number[]){
  let active=0,peak=0,closed=0,returned=false,reads=0
  const iterator=(async function*(){
    try{for(const timestamp of times){reads++;let live=true;yield{timestamp,duration:.1,close(){expect(live).toBe(true);live=false;closed++}}}}finally{returned=true}
  })()
  return{sampler:new PresentationSampler(iterator,1_000_000,()=>{active++;peak=Math.max(peak,active)},()=>active--),
    snapshot:()=>({active,peak,closed,returned,reads})}
}
it('selects the visually active previous frame at VFR boundaries',async()=>{
  const f=fixture([0,.1,.4,.45]),actual=[]
  for(const t of[50,100,150,399,400,449,450,999])actual.push((await f.sampler.select(t*1000,0)).timestamp)
  expect(actual).toEqual([0,.1,.1,.1,.4,.4,.45,.45])
  await f.sampler.close()
  expect(f.snapshot()).toMatchObject({active:0,peak:2,closed:4,returned:true})
})
it('preserves every same-FPS visual at 15/24/30 instead of aliasing sub-microsecond boundaries',async()=>{
  for(const fps of[15,24,30]){
    const iterator=(async function*(){for(let n=0;n<151;n++)yield{timestamp:n/fps,duration:1/fps,close(){}}})()
    const sampler=new PresentationSampler(iterator,90_000)
    for(let n=0;n<150;n++)expect((await sampler.select(offsetUs(n,fps),0)).timestamp).toBe(n/fps)
    await sampler.close()
  }
  expect(presentationUs(-1n,0n,3)).toBe(-333333n)
  expect(presentationUs(1n,0n,2_000_000)).toBe(1n)
})
it('holds current across duplicates without cloning or reading the whole video',async()=>{
  const f=fixture(Array.from({length:1000},(_,i)=>i)),first=await f.sampler.select(0,0)
  for(let i=0;i<150;i++)expect(await f.sampler.select(i,0)).toBe(first)
  expect(f.snapshot().reads).toBe(2)
  await f.sampler.close();expect(f.snapshot().active).toBe(0)
})
it('closes skipped source frames with at most current/lookahead',async()=>{
  const f=fixture(Array.from({length:1000},(_,i)=>i/100))
  expect((await f.sampler.select(5_000_000,0)).timestamp).toBe(5)
  expect(f.snapshot().peak).toBe(2)
  await f.sampler.close();expect(f.snapshot().active).toBe(0)
})
it('handles nonzero origin and selects last duplicate PTS',async()=>{
  const f=fixture([5,5,5.2])
  expect((await f.sampler.select(0,5_000_000)).timestamp).toBe(5)
  expect(f.snapshot().closed).toBe(1);await f.sampler.close()
})
it('rejects reordered presentation output and closes acquired samples',async()=>{
  const f=fixture([0,.2,.1])
  await f.sampler.select(0,0);await expect(f.sampler.select(300_000,0)).rejects.toThrow()
  await f.sampler.close();expect(f.snapshot().active).toBe(0)
})
it('rejects backward queries rather than silently reseeking',async()=>{
  const f=fixture([0,.1,.2]);await f.sampler.select(100_000,0)
  await expect(f.sampler.select(0,0)).rejects.toThrow();await f.sampler.close()
})
it('closes a newly yielded sample when a workload observer rejects it',async()=>{
  let closed=0,released=0
  const iterator=(async function*(){yield{timestamp:0,duration:1,close(){closed++}}})()
  const sampler=new PresentationSampler(iterator,1000,()=>{throw Error('limit')},()=>released++)
  await expect(sampler.select(0,0)).rejects.toThrow('limit')
  await sampler.close();expect(closed).toBe(1);expect(released).toBe(1)
})
it('disposes a sample arriving after cancellation',async()=>{
  let resolve!:(r:IteratorResult<{timestamp:number;duration:number;close():void}>)=>void,closed=0,released=0
  const iterator={next:()=>new Promise<IteratorResult<{timestamp:number;duration:number;close():void}>>(r=>resolve=r),return:async()=>({done:true as const,value:undefined})}
  const sampler=new PresentationSampler(iterator,1000,()=>{},()=>released++)
  const pending=expect(sampler.select(0,0)).rejects.toThrow()
  await sampler.close()
  resolve({done:false,value:{timestamp:0,duration:1,close(){closed++}}})
  await pending;expect(closed).toBe(1);expect(released).toBe(1)
})
