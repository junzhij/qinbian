import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { prepareComponent, elementInfo, patchElement, replaceElement, applyElementResult, normalizeTextStyles, sanitizeHtml } from '../packages/shared/src/index.ts'
import { parseHtml, nodeAt, outerHtml } from '../packages/shared/src/html-tree.ts'
import { createApp } from '../apps/api/src/app.ts'
const component=()=>prepareComponent({html:'<section style="padding:20px;border:1px solid #123456;"><p data-qb-field="body" style="font-size:18px;">原文保持</p><p data-qb-field="outside">外部保留</p></section>',fields:[{id:'body',label:'正文',type:'text',default:'原文保持',suffix:''},{id:'outside',label:'外部',type:'text',default:'外部保留',suffix:''}]})
test('元素路径只替换一个区域，父层与兄弟节点保持一致',()=>{
 const c=component(),selected=elementInfo(c.html,[0,0])!,other=outerHtml(nodeAt(parseHtml(c.html),[0,1]))
 const candidate=selected.html.replace('font-size:18px','font-size:20px'),changed=applyElementResult(c,selected,{html:candidate})
 assert.equal(outerHtml(nodeAt(parseHtml(changed.html),[0,1])),other);assert.ok(changed.html.includes('padding:20px'));assert.ok(changed.html.includes('font-size:20px'))
 assert.throws(()=>replaceElement(c.html,selected,'<section>错误范围</section>'),/标签与边界/)
 assert.throws(()=>replaceElement(c.html,selected,selected.html+'<p>额外内容</p>'),/一个完整元素/)
 assert.throws(()=>patchElement(changed.html,selected,{styles:{'font-size':'21px'}}),/已改变/)
 assert.throws(()=>patchElement(c.html,selected,{styles:{'font-size':'100px'}}),/属性值/)
 assert.throws(()=>patchElement(c.html,selected,{styles:{height:'0px'}}),/高度/)
 assert.ok(!sanitizeHtml(changed.html,true).includes('data-qb-'))
})
test('文字、数值和图片可分别锁定，改数值不会被文字锁误拦截',()=>{
 const c=prepareComponent({html:'<section><p data-qb-field="n">{{n}}</p><p><span leaf="">原文</span></p><section><img src="/api/assets/a/file" alt="原图"></section></section>',fields:[{id:'n',label:'数值',type:'number',default:25,suffix:''}]})
 const number=elementInfo(c.html,[0,0])!
 assert.throws(()=>applyElementResult(c,number,{html:number.html.replace('25','30'),values:{n:30}}),/锁定的数值/)
 const updated=applyElementResult(c,number,{html:number.html.replace('25','30'),values:{n:30}},{text:true,images:true,data:false});assert.equal(updated.values.n,30)
 const text=elementInfo(c.html,[0,1])!;assert.throws(()=>replaceElement(c.html,text,text.html.replace('原文','改写')),/锁定的文字/)
 assert.ok(replaceElement(c.html,text,text.html.replace('原文','改写'),{text:false,images:true,data:true}).includes('改写'))
 const image=elementInfo(c.html,[0,2])!;assert.throws(()=>replaceElement(c.html,image,image.html.replace('/assets/a/','/assets/b/')),/锁定的图片/)
})
test('精细AI只收到相关元素，自动修正锁定内容，确认前检查版本',async()=>{
 let calls=0,last:any,mode='repair'
 const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;last=JSON.parse(raw);calls++;if(mode==='slow'){req.on('close',()=>res.destroy());return}const payload=JSON.parse(last.messages[1].content);let html=payload.sourceHtml.replace(/font-size:\d+px;/,'font-size:20px;');if(mode==='repair'&&calls===1)html=html.replace('原文保持','错误改写');res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({name:'段落精修',html,fields:payload.fields,values:payload.values})}}]}))})
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as any,root=resolve(import.meta.dirname,'..'),dataDir=mkdtempSync(join(tmpdir(),'qinbian-local-ai-')),c=await createApp({root,dataDir,seedDir:join(root,'seed'),apiKey:'sk-fake-test',aiBase:'http://127.0.0.1:'+address.port,aiTimeout:2000})
 const wait=async(key:string)=>{for(let i=0;i<200;i++){const job=c.ai.get(key);if(['ready','failed','cancelled'].includes(job.status))return job;await new Promise(r=>setTimeout(r,10))}throw Error('候选等待超时')}
 try{
  const resource=(await c.app.inject({method:'POST',url:'/api/resources',payload:{name:'测试原件',kind:'component',data:component()}})).json()
  const doc=(await c.app.inject({method:'POST',url:'/api/documents',payload:{title:'精修文章',blocks:[{...resource.data,id:'b',name:'测试',assetIds:[]}],appearance:{backgroundColor:'#EEF3EB',textStyles:normalizeTextStyles()}}})).json(),selection=elementInfo(doc.blocks[0].html,[0,0])!
  const request={operation:'edit',prompt:'只将这一段字号改为20px，保持原文',targetType:'document',targetId:doc.id,targetRevision:doc.revision,blockId:'b',selection:{path:selection.path,fingerprint:selection.fingerprint},colorCount:3}
  let response=await c.app.inject({method:'POST',url:'/api/ai/jobs',payload:request});assert.equal(response.statusCode,202);let job=await wait(response.json().id);assert.equal(job.status,'ready');assert.equal(calls,2)
  const context=JSON.parse(last.messages[1].content);assert.ok(!context.sourceHtml.includes('外部保留'));assert.ok(!context.fields.some((f:any)=>f.id==='outside'));assert.equal(context.examples.length,0);assert.equal(context.palette.colors.length,resource.data.palette.colors.length)
  const other=outerHtml(nodeAt(parseHtml(doc.blocks[0].html),[0,1])),applied=await c.app.inject({method:'POST',url:'/api/ai/jobs/'+job.id+'/apply',payload:{mode:'replace',revision:doc.revision}});assert.equal(applied.statusCode,200)
  let current=c.store.document(doc.id);assert.ok(current.blocks[0]!.html.includes('font-size:20px'));assert.equal(outerHtml(nodeAt(parseHtml(current.blocks[0]!.html),[0,1])),other)
  mode='valid';const fresh=elementInfo(current.blocks[0]!.html,[0,0])!;response=await c.app.inject({method:'POST',url:'/api/ai/jobs',payload:{...request,targetRevision:current.revision,selection:{path:fresh.path,fingerprint:fresh.fingerprint}}});job=await wait(response.json().id);assert.equal(job.status,'ready')
  await c.app.inject({method:'PUT',url:'/api/documents/'+doc.id,payload:{...current,title:'后续编辑'}})
  assert.equal((await c.app.inject({method:'POST',url:'/api/ai/jobs/'+job.id+'/apply',payload:{mode:'replace',revision:c.store.document(doc.id).revision}})).statusCode,409)
  assert.equal(c.ai.get(job.id).status,'ready');assert.equal(c.store.document(doc.id).title,'后续编辑')
  assert.equal((await c.app.inject({method:'POST',url:'/api/ai/jobs/'+job.id+'/apply',payload:{mode:'save'}})).statusCode,200)
  current=c.store.document(doc.id);assert.equal((await c.app.inject({method:'POST',url:'/api/ai/jobs',payload:{...request,targetRevision:current.revision,selection:{path:[0,0],fingerprint:'stale'}}})).statusCode,409)
  const selectedResource=elementInfo(resource.data.html,[0,0])!;response=await c.app.inject({method:'POST',url:'/api/ai/jobs',payload:{operation:'edit',prompt:'调整此段字号',targetType:'resource',targetId:resource.id,targetRevision:1,selection:{path:selectedResource.path,fingerprint:selectedResource.fingerprint}}});job=await wait(response.json().id);assert.equal(job.status,'ready');assert.equal((await c.app.inject({method:'POST',url:'/api/ai/jobs/'+job.id+'/apply',payload:{mode:'replace',revision:1}})).statusCode,200)
  mode='slow';current=c.store.document(doc.id);const latest=elementInfo(current.blocks[0]!.html,[0,0])!;response=await c.app.inject({method:'POST',url:'/api/ai/jobs',payload:{...request,targetRevision:current.revision,selection:{path:latest.path,fingerprint:latest.fingerprint}}});await new Promise(r=>setTimeout(r,20));const cancelled=(await c.app.inject({method:'POST',url:'/api/ai/jobs/'+response.json().id+'/cancel'})).json();assert.equal(cancelled.status,'cancelled');assert.equal(c.store.document(doc.id).revision,current.revision)
 }finally{await c.app.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));rmSync(dataDir,{recursive:true,force:true})}
})
