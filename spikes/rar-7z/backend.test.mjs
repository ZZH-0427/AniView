import { test } from 'node:test'
import assert from 'node:assert/strict'
import { policy, detect, normalizedPath, numeric, dictionary } from './policy.mjs'
import { SevenZipBackend } from './backend.mjs'
test('signatures override misleading extension/MIME; other containers excluded',()=>{
  assert.equal(detect([0x37,0x7a,0xbc,0xaf,0x27,0x1c]),7)
  assert.equal(detect([0x52,0x61,0x72,0x21,0x1a,7,0]),4)
  assert.equal(detect([0x52,0x61,0x72,0x21,0x1a,7,1,0]),5)
  for(const b of [[0x50,0x4b,3,4],[0x4d,0x5a],[],[0x75,0x73,0x74,0x61,0x72]])assert.throws(()=>detect(b),/ARCHIVE_UNSUPPORTED_FORMAT/)
})
test('metadata cannot alter record boundaries or escape numeric/path bounds',()=>{
  const p=policy()
  for(const path of ['../x','/x','C:\\x','\\\\server\\x','line\nbreak','x\0y','x'.repeat(1025),'a/./b'])assert.throws(()=>normalizedPath(path,p))
  for(const path of ['中文/日本語 😀 = : .txt','file = Size = 999.txt','space path'])assert.equal(normalizedPath(path,p),path)
  for(const n of [NaN,Infinity,2**53,-2,1.5])assert.throws(()=>numeric(n))
  assert.equal(numeric(-1),null);assert.equal(numeric(2**40),2**40)
  for(const v of [0,-1,NaN,2**53])assert.throws(()=>policy({maxEntries:v}))
  assert.throws(()=>policy({unexpected:1}));assert.equal(dictionary('Unknown:thing',null),null)
  assert.equal(dictionary('LZMA2:24m',null),25165824)
  assert.equal(dictionary('v6:m5:128K',null),131072)
})
test('terminated generations cannot satisfy a new request; close is idempotent',async()=>{
  const workers=[]
  class FakeWorker {
    constructor(){workers.push(this)}
    postMessage(m){this.message=m}
    terminate(){this.terminated=true}
    deliver(result){this.onmessage({data:{...this.message,type:'RESULT',result}})}
  }
  const old=globalThis.Worker;globalThis.Worker=FakeWorker
  try{
    const b=new SevenZipBackend(),first=b.open(new Blob(['one']))
    const rejected=assert.rejects(first,/ARCHIVE_CANCELLED/);await b.close();await rejected
    const second=b.open(new Blob(['two']));workers[0].deliver({wrong:true});workers[1].deliver({right:true})
    assert.deepEqual(await second,{right:true});assert.equal(b.getMetrics().staleMessages,1)
    await b.close();await b.close();assert.deepEqual(b.getMetrics(),{workersCreated:2,workersTerminated:2,activeWorkers:0,staleMessages:1})
  }finally{globalThis.Worker=old}
})
