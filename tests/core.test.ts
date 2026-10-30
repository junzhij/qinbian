import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createApp } from '../apps/api/src/app.ts'
import { sanitizeHtml, inspectHtml, cleanStyle, articleHtml, htmlAssetIds } from '../packages/shared/src/index.ts'
import {defaultPalette,makeColor} from '../packages/shared/src/bindings.ts'

const root=resolve(import.meta.dirname,'..'),seedDir=join(root,'seed')
async function fixture(extra:any={}){const dataDir=mkdtempSync(join(tmpdir(),'qinbian-test-'));const c=await createApp({root,seedDir,dataDir,apiKey:'',...extra});return {...c,dataDir,async cleanup(){await c.app.close();rmSync(dataDir,{recursive:true,force:true})}}}
function multipart(buffer:Buffer,filename:string,mime:string){const boundary='qinbian-fixture-boundary';return {headers:{'content-type':`multipart/form-data; boundary=${boundary}`},payload:Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),buffer,Buffer.from(`\r\n--${boundary}--\r\n`)])}}
async function ready(c:any,key:string){for(let i=0;i<200;i++){const j=(await c.app.inject({url:'/api/ai/jobs/'+key})).json();if(['ready','failed','cancelled'].includes(j.status))return j;await new Promise(r=>setTimeout(r,10))}throw new Error('AI fixture timed out')}

test('正文清理保留边框圆角对齐与链接，移除脚本及危险地址',()=>{
 const x=sanitizeHtml('<section style="border-left:3px solid #ad8240;border-top-left-radius:5px;text-align:center;background-image:url(x);position:absolute"><p style="font-size:40px">测试<a href="https://example.com">链接</a></p><script>alert(1)</script><img src="javascript:evil()" onerror="evil()"></section>')
 assert.match(x,/border-left:3px solid #ad8240/);assert.match(x,/border-top-left-radius:5px/);assert.match(x,/text-align:center/);assert.match(x,/font-size:24px/);assert.match(x,/href="https:\/\/example.com"/);assert.match(x,/leaf=""/)
 for(const s of ['<script','onerror','javascript:','position:','background-image'])assert.ok(!x.includes(s))
 assert.ok(inspectHtml('<img src="https://remote.example/image.png">').issues.length)
 assert.equal(cleanStyle('color:rgb(1, 2, 3);font-family:"a;b",serif;'),'color:rgb(1, 2, 3);font-family:"a;b",serif;')
})
test('96个组件与8套模板幂等迁移，内置原件只读',async()=>{
 const c=await fixture();try{
  let rs=(await c.app.inject('/api/resources')).json();assert.equal(rs.filter((r:any)=>r.kind==='component').length,96);assert.equal(rs.filter((r:any)=>r.kind==='template').length,8)
  await c.store.seed();assert.equal((await c.app.inject('/api/resources')).json().length,106)
  assert.equal((await c.app.inject('/api/assets')).json().length,3)
  assert.equal(c.store.sqlite.pragma('foreign_keys',{simple:true}),1);assert.equal(c.store.sqlite.pragma('journal_mode',{simple:true}),'wal')
  const a=c.store.resource('builtin-A01');assert.ok(a.data.html!.includes('/api/assets/'));assert.equal((await c.app.inject({method:'PUT',url:'/api/resources/'+a.id,payload:a})).statusCode,403)
  for(const r of rs.filter((r:any)=>r.kind==='component')){const html=sanitizeHtml(r.data.html);assert.equal(html,r.data.html,`${r.legacyId} sanitizer must be stable`);assert.ok(!html.includes('<script'))}
 }finally{await c.cleanup()}
})
test('套组、组件副本、版本冲突与回收站',async()=>{
 const c=await fixture();try{
  const t=(await c.app.inject({method:'POST',url:'/api/theme-sets',payload:{name:'青衿札记'}})).json()
  const r=(await c.app.inject({method:'POST',url:'/api/resources/builtin-L03/clone',payload:{themeSetId:t.id}})).json();assert.equal(r.builtin,false)
  const update={...r,name:'新的征集卡',data:{html:r.data.html.replace('把你的山海故事','把校园故事')}}
  const saved=await c.app.inject({method:'PUT',url:'/api/resources/'+r.id,payload:update});assert.equal(saved.statusCode,200);assert.equal(saved.json().revision,2)
  assert.equal((await c.app.inject({method:'PUT',url:'/api/resources/'+r.id,payload:update})).statusCode,409)
  assert.equal((await c.app.inject('/api/resources/'+r.id+'/versions')).json().length,2)
  await c.app.inject({method:'DELETE',url:'/api/resources/'+r.id});assert.equal((await c.app.inject('/api/resources/'+r.id)).statusCode,404)
  await c.app.inject({method:'POST',url:'/api/resources/'+r.id+'/restore'});assert.equal((await c.app.inject('/api/resources/'+r.id)).statusCode,200)
  await c.app.inject({method:'DELETE',url:'/api/theme-sets/'+t.id});assert.equal(c.store.resource(r.id).themeSetId,'mine')
 }finally{await c.cleanup()}
})
test('模板生成文章快照，组件后续修改不会回写旧稿',async()=>{
 const c=await fixture();try{
  const cloned=(await c.app.inject({method:'POST',url:'/api/resources/builtin-C03/clone'})).json()
  const d=(await c.app.inject({method:'POST',url:'/api/documents',payload:{resourceId:cloned.id}})).json()
  await c.app.inject({method:'PUT',url:'/api/resources/'+cloned.id,payload:{...cloned,data:{html:'<p><span leaf="">新内容</span></p>'}}})
  assert.equal(c.store.document(d.id).blocks[0]!.html,d.blocks[0].html)
  const template=(await c.app.inject({method:'POST',url:'/api/documents/'+d.id+'/template',payload:{name:'自建模板'}})).json();assert.equal(template.kind,'template')
  const newDoc=(await c.app.inject({method:'POST',url:'/api/documents',payload:{resourceId:template.id}})).json();assert.notEqual(newDoc.blocks[0].id,d.blocks[0].id)
 }finally{await c.cleanup()}
})
test('旧1、2版草稿包含自定义编号与内嵌图片时完整导入，导出为自包含HTML',async()=>{
 const c=await fixture();try{
  const data=readFileSync(join(seedDir,'assets/校名.png')).toString('base64')
  for(const version of [1,2]){
   const r=await c.app.inject({method:'POST',url:'/api/documents/import',payload:{format:'neuq-shanhai-draft',version,blocks:[{id:'A01'},{id:'CUSTOM-AI-0001',html:`<section style="border-left:2px solid #123456;border-radius:5px;text-align:right"><p>自定义内容</p><img src="data:image/png;base64,${data}"></section>`}]}})
   assert.equal(r.statusCode,201);const d=r.json();assert.equal(d.blocks.length,2);assert.match(d.blocks[1].html,/自定义内容/);assert.ok(htmlAssetIds(d.blocks[1].html).length)
   const out=(await c.app.inject('/api/documents/'+d.id+'/export')).json();assert.match(out.html,/data:image\/png;base64/);assert.match(out.html,/border-radius:5px/);assert.match(out.html,/text-align:right/);assert.ok(!out.html.includes('/api/assets/'))
  }
 }finally{await c.cleanup()}
})
test('图片上传识别真实格式、去重，引用图片禁止删除，原文件字节保留',async()=>{
 const c=await fixture();try{
  const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')
  const response=await c.app.inject({method:'POST',url:'/api/assets',...multipart(gif,'演示.gif','image/gif')});assert.equal(response.statusCode,201);const a=response.json();assert.equal(a.mime,'image/gif')
  const duplicate=(await c.app.inject({method:'POST',url:'/api/assets',...multipart(gif,'另一个名字.gif','image/gif')})).json();assert.equal(a.id,duplicate.id)
  assert.deepEqual((await c.app.inject('/api/assets/'+a.id+'/file')).rawPayload,gif)
  assert.equal((await c.app.inject({method:'POST',url:'/api/assets',...multipart(Buffer.from('not an image'),'fake.png','image/png')})).statusCode,400)
  const r=await c.app.inject({method:'POST',url:'/api/resources',payload:{name:'GIF组件',kind:'component',themeSetId:'mine',data:{html:`<section><img src="/api/assets/${a.id}/file" alt="演示动图"></section>`}}});assert.equal(r.statusCode,201)
  assert.equal((await c.app.inject({method:'DELETE',url:'/api/assets/'+a.id})).statusCode,409)
 }finally{await c.cleanup()}
})
test('备份恢复包含数据库与原图，恢复前留存当前数据',async()=>{
 const c=await fixture();try{
  const d=(await c.app.inject({method:'POST',url:'/api/documents',payload:{title:'备份时的文章',blocks:[],themeSetId:'mine'}})).json()
  const b=await c.app.inject({method:'POST',url:'/api/backups'});assert.equal(b.statusCode,200);assert.equal(b.headers['content-type'],'application/zip')
  await c.app.inject({method:'PUT',url:'/api/documents/'+d.id,payload:{...d,title:'备份之后修改'}})
  const restored=await c.app.inject({method:'POST',url:'/api/backups/restore',...multipart(b.rawPayload,'backup.zip','application/zip')});assert.equal(restored.statusCode,200)
  assert.equal(c.store.document(d.id).title,'备份时的文章');assert.ok(restored.json().previousBackup)
  assert.equal((await c.app.inject('/api/resources')).json().length,106)
 }finally{await c.cleanup()}
})
test('API拒绝跨站写入，设置响应不包含密钥',async()=>{
 const c=await fixture({apiKey:'sk-fake-sensitive-test-only'});try{
  const response=await c.app.inject({method:'POST',url:'/api/documents',headers:{origin:'https://untrusted.example'},payload:{title:'x'}});assert.equal(response.statusCode,403)
  const s=await c.app.inject('/api/settings');assert.ok(!s.body.includes('sk-fake'));assert.equal(s.json().aiConfigured,true)
 }finally{await c.cleanup()}
})
test('配色卡保存与套用，颜色重命名保持稳定绑定且不回写文章快照',async()=>{
 const c=await fixture();try{
  const palette={...structuredClone(defaultPalette),name:'三色配色',colors:defaultPalette.colors.slice(0,3).map(c=>({...c}))}
  const theme=(await c.app.inject({method:'POST',url:'/api/theme-sets',payload:{name:'配色测试',palette}})).json()
  const resource=(await c.app.inject({method:'POST',url:'/api/resources',payload:{name:'参数卡',themeSetId:theme.id,kind:'component',data:{palette,html:'<div style="color:{{color1-regular}};"><span leaf="">文本框内容占位</span></div>'}}})).json()
  const d=(await c.app.inject({method:'POST',url:'/api/documents',payload:{resourceId:resource.id}})).json()
  palette.colors[0]!.name='可以自由改名';palette.colors[0]!.regular='#224466'
  const updated=await c.app.inject({method:'PATCH',url:'/api/theme-sets/'+theme.id,payload:{name:theme.name,palette}});assert.equal(updated.statusCode,200);assert.equal(updated.json().palette.colors[0].id,'color1');assert.equal(updated.json().tokens['可以自由改名'],'#224466')
  assert.equal(c.store.document(d.id).blocks[0]!.html,d.blocks[0].html)
  const card=(await c.app.inject({method:'POST',url:'/api/resources',payload:{name:'复用配色',themeSetId:'mine',kind:'palette',data:{palette}}})).json();assert.equal(card.kind,'palette')
  assert.equal((await c.app.inject({method:'POST',url:'/api/resources/'+card.id+'/apply-palette',payload:{themeSetId:'mine'}})).statusCode,200)
  assert.equal(c.store.theme('mine').palette!.colors.length,3)
  assert.equal((await c.app.inject({method:'POST',url:'/api/resources',payload:{name:'不合法配色',kind:'palette',data:{palette:{...palette,colors:palette.colors.slice(0,2)}}}})).statusCode,400)
 }finally{await c.cleanup()}
})
test('AI生成、结构修正、失败、取消与过期替换保护',async()=>{
 let mode='valid',calls=0,lastRequest:any
 const server=createServer(async(req,res)=>{let input='';for await(const chunk of req)input+=chunk;lastRequest=JSON.parse(input);calls++;if(mode==='slow'){req.on('close',()=>res.destroy());return}res.setHeader('Content-Type','application/json');const bad=mode==='invalid'||mode==='repair'&&calls===1;res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({name:'AI演示组件',description:'演示',category:'正文与导读',tags:['演示'],html:bad?'<script>bad()</script>':'<section style="border-left:2px solid #567067;padding:18px"><p><span leaf="">演示文字</span></p></section>'})}}],usage:{prompt_tokens:20,completion_tokens:20}}))})
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as any
 const c=await fixture({apiKey:'sk-test-only',aiBase:'http://127.0.0.1:'+address.port,aiTimeout:2000})
 try{
  let j=(await c.app.inject({method:'POST',url:'/api/ai/jobs',payload:{operation:'generate',prompt:'采用三色设计生成演示卡',colorCount:6}})).json();j=await ready(c,j.id);assert.equal(j.status,'ready');assert.equal(lastRequest.model,'deepseek-v4-pro');assert.equal(lastRequest.response_format.type,'json_object');const context=JSON.parse(lastRequest.messages[1].content);assert.ok(context.examples.length<=2);assert.match(context.typography.heading,/Songti SC/);assert.match(context.typography.body,/PingFang SC/);assert.equal(context.colorCount,3);assert.equal(context.palette.colors.length,3)
  const saved=await c.app.inject({method:'POST',url:'/api/ai/jobs/'+j.id+'/apply',payload:{mode:'save'}});assert.equal(saved.statusCode,200);const r=saved.json().value
  j=(await c.app.inject({method:'POST',url:'/api/ai/jobs',payload:{operation:'edit',prompt:'换成朱砂色',targetType:'resource',targetId:r.id,targetRevision:r.revision,sourceHtml:r.data.html}})).json();j=await ready(c,j.id)
  await c.app.inject({method:'PUT',url:'/api/resources/'+r.id,payload:{...r,name:'已经继续修改'}})
  assert.equal((await c.app.inject({method:'POST',url:'/api/ai/jobs/'+j.id+'/apply',payload:{mode:'replace',revision:2}})).statusCode,409)
  assert.equal(c.store.resource(r.id).name,'已经继续修改')
  mode='repair';calls=0;j=(await c.app.inject({method:'POST',url:'/api/ai/jobs',payload:{operation:'generate',prompt:'请修正演示卡'}})).json();j=await ready(c,j.id);assert.equal(j.status,'ready');assert.equal(calls,2)
  mode='invalid';calls=0;j=(await c.app.inject({method:'POST',url:'/api/ai/jobs',payload:{operation:'generate',prompt:'生成不合格测试'}})).json();j=await ready(c,j.id);assert.equal(j.status,'failed');assert.equal(calls,2)
  mode='slow';j=(await c.app.inject({method:'POST',url:'/api/ai/jobs',payload:{operation:'generate',prompt:'取消演示测试'}})).json();await new Promise(r=>setTimeout(r,20));const cancelled=(await c.app.inject({method:'POST',url:'/api/ai/jobs/'+j.id+'/cancel'})).json();assert.equal(cancelled.status,'cancelled')
 }finally{await c.cleanup();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
})
