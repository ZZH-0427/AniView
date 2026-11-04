import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(()=>{vi.resetModules();vi.unstubAllEnvs();vi.unstubAllGlobals()})
const value={activeArchiveWorkers:0,activeArchiveSessions:0,pendingReads:0,pendingPasswordAccess:0,currentExtractedBytes:0,cleanupErrors:0}
describe('nonsecret archive cleanup snapshot',()=>{
  it('copies only explicit ownership counters, without a credential, hash, length, metadata or request object',async()=>{
    const {archiveCleanup,recordArchiveCleanup}=await import('./archive-cleanup'),listener=vi.fn(),stop=archiveCleanup.subscribe(listener)
    const contaminated={...value,password:'private',passwordLength:7,passwordHash:'private',request:{password:'private'},filename:'private'}
    recordArchiveCleanup(contaminated)
    expect(archiveCleanup.getSnapshot()).toEqual(value);expect(JSON.stringify(archiveCleanup.getSnapshot())).not.toContain('private');expect(listener).toHaveBeenCalledOnce()
    stop();recordArchiveCleanup(value);expect(listener).toHaveBeenCalledOnce()
  })
  it('retains no history in ordinary production mode',async()=>{
    vi.stubEnv('DEV',false);vi.stubGlobal('location',{search:''})
    const {archiveCleanup,recordArchiveCleanup}=await import('./archive-cleanup');recordArchiveCleanup(value);expect(archiveCleanup.getSnapshot()).toBeNull()
  })
})
