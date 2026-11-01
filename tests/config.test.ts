import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

test('密钥读取工程根目录env，兼容说明前缀，环境变量可覆盖',()=>{
 const temp=mkdtempSync(join(tmpdir(),'qinbian-config-')),root=join(temp,'app');mkdirSync(root)
 const file=pathToFileURL(resolve(import.meta.dirname,'../apps/api/src/config.ts')).href
 const rootKey='sk-qinbian-test-only-root-00000000',overrideKey='sk-qinbian-test-only-env-00000000'
 const read=(expected:string,extra:Record<string,string>={})=>JSON.parse(execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`import {config} from ${JSON.stringify(file)};const c=config();console.log(JSON.stringify({rootMatches:c.root===process.env.QINBIAN_ROOT,keyMatches:c.apiKey===process.env.EXPECTED_TEST_KEY}))`],{encoding:'utf8',env:{...process.env,QINBIAN_ROOT:root,QINBIAN_ENV_FILE:'',DEEPSEEK_API_KEY:'',EXPECTED_TEST_KEY:expected,...extra}}))
 try{
  writeFileSync(join(temp,'env'),'DEEPSEEK_API_KEY=parent-file-must-not-be-read')
  assert.equal(read('').keyMatches,true)
  writeFileSync(join(root,'env'),'DEEPSEEK_API_KEY='+rootKey)
  assert.deepEqual(read(rootKey),{rootMatches:true,keyMatches:true})
  writeFileSync(join(root,'env'),'DeepSeek 接口密钥：'+rootKey)
  assert.equal(read(rootKey).keyMatches,true)
  assert.equal(read(overrideKey,{DEEPSEEK_API_KEY:overrideKey}).keyMatches,true)
 }finally{rmSync(temp,{recursive:true,force:true})}
})
