import type { CanonicalAnimationFrame } from '../conversion/model'
import type { SamplingPlan, VideoInspection, VideoInputCode, VideoSourceMetrics, VideoSourceOptions } from './model'
export type SourceRequest =
  | {id:number;type:'open';size:number}
  | {id:number;type:'configure';options:VideoSourceOptions}
  | {id:number;type:'next'|'close'}
  | {type:'ack'}
  | {type:'read-result';requestId:number;data:ArrayBuffer}
  | {type:'read-error';requestId:number}
export type SourceResponse =
  | {type:'read';requestId:number;start:number;end:number}
  | {type:'phase';metrics:VideoSourceMetrics}
  | {id:number;type:'ready';inspection:VideoInspection;metrics:VideoSourceMetrics}
  | {id:number;type:'configured';plan:SamplingPlan;metrics:VideoSourceMetrics}
  | {id:number;type:'frame';frame:CanonicalAnimationFrame;metrics:VideoSourceMetrics}
  | {id:number;type:'end'|'closed';metrics:VideoSourceMetrics}
  | {id:number;type:'error';code:VideoInputCode;metrics:VideoSourceMetrics}
