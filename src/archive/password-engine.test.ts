import { describe, expect, it, vi } from 'vitest'
import { ERR_INVALID_AUTHENTICATION_CODE, ERR_INVALID_COMPRESSED_DATA, ERR_INVALID_CRC32, ERR_INVALID_PASSWORD,
  ERR_INVALID_UNCOMPRESSED_SIZE, ERR_UNSUPPORTED_ENCRYPTION, ERR_ENCRYPTED_CENTRAL_DIRECTORY } from '@zip.js/zip.js'
import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js'
import { ArchiveEngine, boundedBlobWriter } from './archive-engine'
import { archiveFailure } from './archive-errors'
import { assertArchiveTotals, createArchiveEntryMetadata, DEFAULT_ARCHIVE_LIMITS } from './archive-policy'

const fixtures=import.meta.glob<string>('../../tests/fixtures/zip/password-*.zip',{eager:true,query:'?url&inline',import:'default'})
const fixture=(name:string)=>new Blob([Uint8Array.from(atob(fixtures[`../../tests/fixtures/zip/${name}`]!.split(',')[1]!),c=>c.charCodeAt(0))])
const open=(name:string)=>ArchiveEngine.open(fixture(name),DEFAULT_ARCHIVE_LIMITS)
const password='aniview-test' // TEST FIXTURE ONLY.
async function encryptedLarge() {
  const data=new Uint8Array(1024*1024);for(let i=0;i<data.length;i++)data[i]=(i*31+(i>>>8))&255
  const writer=new ZipWriter(new BlobWriter(),{useWebWorkers:false,useCompressionStream:false})
  await writer.add('synthetic.bin',new Uint8ArrayReader(data),{level:0,password,encryptionStrength:3})
  return writer.close()
}
describe('actual encrypted-entry extraction and integrity',()=>{
  it.each(['zipcrypto','aes128','aes192','aes256'])('reads external 7-Zip %s STORE and DEFLATE with no/wrong/correct password',async kind=>{
    for(const method of ['store','deflate']){const e=await open(`password-${kind}-${method}.zip`)
      try{expect(e.metrics.extractions).toBe(0);expect(e.metadata[0]).toMatchObject({encrypted:true,encryption:kind==='zipcrypto'?'zipcrypto':'aes'})
        await expect(e.extract(0)).rejects.toMatchObject({code:'ARCHIVE_ENCRYPTED'})
        await expect(e.extract(0,{password:'wrong'})).rejects.toMatchObject({code:'ARCHIVE_WRONG_PASSWORD'})
        const blob=await e.extract(0,{password});expect(blob.size).toBe(114);expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0,6))).toBe('GIF89a')
      }finally{await e.close()}}
  })
  it('keeps mixed public siblings and different-password retry in the same reader',async()=>{
    const e=await open('password-mixed.zip');try{expect(e.metadata.map(x=>x.encrypted)).toEqual([false,true,false,true,true]);await e.extract(0);await e.extract(1,{password});await e.extract(2);await e.extract(3,{password});await e.extract(4,{password})}finally{await e.close()}
    const d=await open('password-different.zip');try{await d.extract(0,{password});await expect(d.extract(1,{password})).rejects.toMatchObject({code:'ARCHIVE_WRONG_PASSWORD'});await d.extract(1,{password:'beta'});await d.extract(2,{password})}finally{await d.close()}
  })
  it.each([['password-corrupt-zipcrypto.zip','ARCHIVE_PASSWORD_OR_CORRUPTED'],['password-corrupt-aes.zip','ARCHIVE_INTEGRITY_FAILED'],['password-corrupt-header.zip','ARCHIVE_WRONG_PASSWORD']] as const)('does not publish corrupted %s or call every integrity failure a wrong password',async(name,code)=>{
    const e=await open(name);try{await expect(e.extract(0,{password})).rejects.toMatchObject({code})}finally{await e.close()}
  })
  it.each(['password-unsupported.zip','password-invalid-strength.zip'])('blocks unsupported %s before input/extraction',async name=>{
    const e=await open(name);try{expect(e.metadata[0]).toMatchObject({encryption:'unsupported',blockedCode:'ARCHIVE_UNSUPPORTED_ENCRYPTION'});await expect(e.extract(0,{password})).rejects.toMatchObject({code:'ARCHIVE_UNSUPPORTED_ENCRYPTION'});expect(e.metrics.extractions).toBe(0)}finally{await e.close()}
  })
  it.each([ERR_INVALID_CRC32,ERR_INVALID_COMPRESSED_DATA,ERR_INVALID_UNCOMPRESSED_SIZE])('keeps ZipCrypto ambiguity for %s while preserving plain corruption',message=>{
    expect(archiveFailure(new Error(message),'zipcrypto')).toMatchObject({code:'ARCHIVE_PASSWORD_OR_CORRUPTED'})
    expect(archiveFailure(new Error(message),'none')).toMatchObject({code:'ARCHIVE_CORRUPTED'})
  })
  it('maps exported constants without retaining raw cause/options',()=>{
    for(const [message,code] of [[ERR_INVALID_PASSWORD,'ARCHIVE_WRONG_PASSWORD'],[ERR_INVALID_AUTHENTICATION_CODE,'ARCHIVE_INTEGRITY_FAILED'],[ERR_UNSUPPORTED_ENCRYPTION,'ARCHIVE_UNSUPPORTED_ENCRYPTION'],[ERR_ENCRYPTED_CENTRAL_DIRECTORY,'ARCHIVE_UNSUPPORTED_ENCRYPTION']] as const){const cause=new Error(message,{cause:{password:'private'}});const error=archiveFailure(cause);expect(error).toMatchObject({code});expect(JSON.stringify(error)).not.toContain('private');expect(error.cause).toBeUndefined()}
  })
  it('keeps encrypted size/ratio/aggregate preflight limits',()=>{
    const input={name:'entry.gif',directory:false,encrypted:true,compressedSize:100,uncompressedSize:100,compressionMethod:0}
    expect(createArchiveEntryMetadata({...input,uncompressedSize:64*1024*1024+1},0)).toMatchObject({blockedCode:'ARCHIVE_ENTRY_TOO_LARGE'})
    expect(createArchiveEntryMetadata({...input,compressedSize:1,uncompressedSize:1001},0)).toMatchObject({blockedCode:'ARCHIVE_LIMIT_EXCEEDED'})
    expect(()=>assertArchiveTotals({entryCount:2,totalBytes:2*1024*1024*1024+1,totalPathLength:10})).toThrow(expect.objectContaining({code:'ARCHIVE_LIMIT_EXCEEDED'}))
  })
  it('discards already accepted chunks after a later write failure and cannot publish a partial Blob',async()=>{
    const output=boundedBlobWriter(8,16),writer=output.writable.getWriter();await writer.write(new Uint8Array(8))
    await expect(writer.write(new Uint8Array(1))).rejects.toMatchObject({code:'ARCHIVE_ENTRY_TOO_LARGE'})
    expect(()=>output.blob()).toThrow();const failed=boundedBlobWriter(16,8),sink=failed.writable.getWriter();await sink.write(new Uint8Array(8));failed.discard();expect(()=>failed.blob()).toThrow()
  })
  it('rejects a real large AES final-auth failure without returning any plaintext Blob',async()=>{
    const data=new Uint8Array(await(await encryptedLarge()).arrayBuffer()),view=new DataView(data.buffer)
    const central=view.getUint32(data.length-6,true),local=view.getUint32(central+42,true)
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),end=start+view.getUint32(central+20,true)-1
    data[end]=data[end]!^128
    const engine=await ArchiveEngine.open(new Blob([data]),DEFAULT_ARCHIVE_LIMITS)
    try{await expect(engine.extract(0,{password})).rejects.toMatchObject({code:'ARCHIVE_INTEGRITY_FAILED'})}finally{await engine.close()}
  })
  it('cancels during real AES key derivation, joins the failed read and retries the same Reader',async()=>{
    const engine=await ArchiveEngine.open(await encryptedLarge(),DEFAULT_ARCHIVE_LIMITS),abort=new AbortController()
    const original=crypto.subtle.deriveBits.bind(crypto.subtle)
    const derive=vi.spyOn(crypto.subtle,'deriveBits').mockImplementationOnce(async(...args)=>{abort.abort();return original(...args)})
    try{
      await expect(engine.extract(0,{password,signal:abort.signal})).rejects.toMatchObject({name:'AbortError'})
      expect(derive).toHaveBeenCalledOnce();derive.mockRestore()
      expect((await engine.extract(0,{password})).size).toBe(1024*1024)
    }finally{derive.mockRestore();await engine.close()}
  })
})
