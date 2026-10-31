import {afterEach,it,expect,vi} from 'vitest'
import {run} from './product-conversion'
afterEach(()=>vi.unstubAllGlobals())
it('rejects insecure product contexts before opening any source or Worker',async()=>{
  vi.stubGlobal('isSecureContext',false);const source=vi.fn(),worker=vi.fn()
  await expect(run(source,new AbortController().signal,{worker,metrics:vi.fn(),phase:vi.fn(),progress:vi.fn()})).rejects.toMatchObject({code:'VIDEO_API_UNAVAILABLE'})
  expect(source).not.toHaveBeenCalled();expect(worker).not.toHaveBeenCalled()
})
