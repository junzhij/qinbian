import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createApp } from '../apps/api/src/app.ts'
import { normalizeTextStyles } from '../packages/shared/src/index.ts'
test('全文样式随文章、模板、历史版本保存，停用可恢复且导出没有编辑记录',async()=>{
 const root=resolve(import.meta.dirname,'..'),dataDir=mkdtempSync(join(tmpdir(),'qinbian-text-style-')),c=await createApp({root,seedDir:join(root,'seed'),dataDir,apiKey:''})
 try{
  const textStyles=normalizeTextStyles();textStyles.roles.body.fontSize=16
  const create=await c.app.inject({method:'POST',url:'/api/documents',payload:{title:'规则文章',blocks:[{id:'b',name:'正文',html:'<section style="border-left:2px solid #123456;"><p data-qb-role="body" style="font-size:18px;">正文内容保留。</p></section>'}],appearance:{backgroundColor:'#EEF3EB',textStyles}}});assert.equal(create.statusCode,201)
  let d=create.json();assert.ok(d.blocks[0].html.includes('font-size:16px'));assert.ok(d.blocks[0].html.includes('data-qb-typography'))
  const clone=(await c.app.inject({method:'POST',url:'/api/documents/'+d.id+'/clone'})).json();assert.deepEqual(clone.appearance,d.appearance)
  const template=(await c.app.inject({method:'POST',url:'/api/documents/'+d.id+'/template',payload:{name:'规则模板'}})).json();assert.deepEqual(template.data.appearance,d.appearance)
  const applied=(await c.app.inject({method:'POST',url:'/api/documents',payload:{resourceId:template.id}})).json();assert.deepEqual(applied.appearance,d.appearance);assert.ok(applied.blocks[0].html.includes('font-size:16px'))
  const output=(await c.app.inject('/api/documents/'+d.id+'/export')).json().html;assert.ok(output.includes('font-size:16px'));assert.ok(output.includes('text-align:justify'));assert.ok(!output.includes('data-qb-'))
  let result=await c.app.inject({method:'PUT',url:'/api/documents/'+d.id,payload:{...d,appearance:{backgroundColor:'#EEF3EB'}}});assert.equal(result.statusCode,200);d=result.json();assert.ok(d.blocks[0].html.includes('font-size:18px'));assert.ok(!d.blocks[0].html.includes('data-qb-typography'))
  result=await c.app.inject({method:'POST',url:`/api/documents/${d.id}/versions/1/restore`,payload:{revision:d.revision}});assert.equal(result.statusCode,200);assert.ok(result.json().blocks[0].html.includes('font-size:16px'))
  const restored:any=result.json()
  const invalid=await c.app.inject({method:'PUT',url:'/api/documents/'+d.id,payload:{...restored,appearance:{backgroundColor:'#FFFFFF',textStyles:{...textStyles,roles:{...textStyles.roles,body:{...textStyles.roles.body,fontSize:99}}}}}});assert.equal(invalid.statusCode,400)
 }finally{await c.app.close();rmSync(dataDir,{recursive:true,force:true})}
})
