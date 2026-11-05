import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchBrowser } from '../../tools/creation/browser.mjs'
const b=await launchBrowser(resolve('.tools/m10c2/browser-'+(process.argv[2]??'desktop')))
const report={}
try{
  await b.navigate(process.env.SPIKE_URL??'http://127.0.0.1:4292/AniView/')
  await b.waitFor('!!globalThis.spike',30000)
  const group=process.argv[2]??'small'
  report.result=await b.evaluate(`spike.run(${JSON.stringify(group)})`,600000)
  report.rows=await b.evaluate('spike.state.rows');report.errors=b.errors;report.browser=await b.send('Browser.getVersion')
  await writeFile('.tools/m10c2/'+(process.env.SPIKE_REPORT??group)+'.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({...report,rows:undefined}))
}finally{await b.close()}
