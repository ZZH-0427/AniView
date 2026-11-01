/** Local scheduling observations, not an attribution of a timer gap to UI blocking. */
export function observeVideoHeartbeat(){
 let last=performance.now(),wall=Date.now(),maxGapMs=0,maxVisibleGapMs=0,hidden=false
 let hiddenInGap=typeof document!=='undefined'&&document.visibilityState!=='visible'
 const gaps:{gapMs:number;wallGapMs:number;hidden:boolean}[]=[]
 const visibility=()=>{if(document.visibilityState!=='visible'){hidden=true;hiddenInGap=true}}
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',visibility)
 const timer=setInterval(()=>{
  const now=performance.now(),date=Date.now(),gap=now-last
  maxGapMs=Math.max(maxGapMs,gap)
  if(!hiddenInGap)maxVisibleGapMs=Math.max(maxVisibleGapMs,gap)
  if(gap>1000){gaps.push({gapMs:gap,wallGapMs:date-wall,hidden:hiddenInGap});if(gaps.length>4)gaps.shift()}
  last=now;wall=date;hiddenInGap=typeof document!=='undefined'&&document.visibilityState!=='visible'
 },50)
 return()=>{clearInterval(timer);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',visibility)
  return{maxGapMs,maxVisibleGapMs,hiddenDuringJob:hidden,gaps}}
}
