import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { eq, desc, and, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { readFileSync, createReadStream, writeFileSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { cropInputSchema, resourceInput, documentInput, themeInput, aiInput, models, sanitizeHtml, articleHtml, htmlAssetIds, inspectHtml, prepareComponent, normalizePalette, legacyTokens, type Block, type Resource } from '@qinbian/shared'
import { config as loadConfig, type Config } from './config.ts'
import { renderChart } from './charts.ts'
import { chartFromUrl } from '@qinbian/shared'
import { Store, id, now, fail } from './store.ts'
import { resources, themeSets, documents, assets, jobs, versions, settings } from './schema.ts'
import { AiService } from './ai.ts'
import { makeBackup, restoreBackup } from './backup.ts'
import { isAllowedOrigin } from './network.ts'

export async function createApp(options:Partial<Config>={}){
 const store=new Store(loadConfig(options));await store.seed();const ai=new AiService(store)
 const app=Fastify({logger:false,bodyLimit:105*1024*1024,ajv:{customOptions:{removeAdditional:false}}})
 await app.register(multipart,{limits:{fileSize:20*1024*1024,files:1}})
 app.addHook('onRequest',async(req)=>{
  const origin=req.headers.origin
  if(origin&&!isAllowedOrigin(origin,store.config)&&!store.config.allowTestOrigin)fail(403,'请求来源不在允许的访问地址中')
  if(store.restoring)fail(503,'正在恢复备份，请稍候')
 })
 app.setErrorHandler((error:any,_req,reply)=>{
  const code=error instanceof z.ZodError?400:error.statusCode||500
  const message=error instanceof z.ZodError?error.issues.map(i=>i.message).join('；'):code<500?error.message:code===503?error.message:'操作未完成，请稍后重试'
  reply.code(code).send({message:String(message).replaceAll(store.config.apiKey||'__no_secret__','[已隐藏]')})
 })
 app.addHook('onClose',async()=>{ai.close();store.close()})
 const param=(req:any)=>String(req.params.id)
 const nonBuiltin=(r:{builtin:boolean})=>{if(r.builtin)fail(403,'内置资源保留原件，请先创建副本')}
 const cleanData=(input:z.infer<typeof resourceInput>)=>{
  if(input.kind==='component'){
   if(!input.data.html?.trim())fail(400,'组件内容不能为空')
   const data=prepareComponent(input.data,input.data.palette||store.bestPalette(input.data.html,normalizePalette(store.theme(input.themeSetId).palette)));const check=inspectHtml(data.html);if(check.issues.length)fail(400,check.issues.join('；'));store.assertAssets(check.html);return{...data,html:check.html}
  }
  if(input.kind==='palette')return{palette:normalizePalette(input.data.palette)}
  return{blocks:store.normalizeBlocks(input.data.blocks||[])}
 }
 const saveResource=(key:string,input:z.infer<typeof resourceInput>)=>{
  const old=store.resource(key);nonBuiltin(old);store.checkRevision(old,input.revision);store.assertWritableTheme(input.themeSetId)
  if(input.kind!==old.kind)fail(400,'不能改变资源类型')
  const patch={...input,data:cleanData(input),revision:old.revision+1,updatedAt:now()}
  store.sqlite.transaction(()=>{store.record('resource',old);store.db.update(resources).set(patch).where(eq(resources.id,key)).run();store.record('resource',store.resource(key))})()
  return store.resource(key)
 }
 const saveDocument=(key:string,input:z.infer<typeof documentInput>)=>{
  const old=store.document(key);store.checkRevision(old,input.revision);store.theme(input.themeSetId)
  const patch={...input,blocks:store.normalizeBlocks(input.blocks),revision:old.revision+1,updatedAt:now()}
  store.sqlite.transaction(()=>{store.record('document',old);store.db.update(documents).set(patch).where(eq(documents.id,key)).run();store.record('document',store.document(key))})()
  return store.document(key)
 }
 const createResource=(raw:unknown)=>{
  const input=resourceInput.parse(raw);store.assertWritableTheme(input.themeSetId);const t=now()
  const row={...input,id:id(),data:cleanData(input),revision:1,builtin:false,legacyId:null,createdAt:t,updatedAt:t,deletedAt:null}
  store.db.insert(resources).values(row).run();store.record('resource',row);return row
 }
 const createDocument=(raw:unknown)=>{
  const input=documentInput.parse(raw);store.theme(input.themeSetId);const t=now(),row={...input,id:id(),blocks:store.normalizeBlocks(input.blocks),revision:1,createdAt:t,updatedAt:t,deletedAt:null}
  store.db.insert(documents).values(row).run();store.record('document',row);return row
 }
 app.get('/api/health',()=>({ok:true,app:'秦编',version:'1.0.0'}))
 app.get('/api/theme-sets',()=>store.db.select().from(themeSets).all().filter(t=>!t.deletedAt))
 app.post('/api/theme-sets',async(req,reply)=>{const input=themeInput.parse(req.body),t=now(),palette=normalizePalette(input.palette,input.tokens);const row={...input,palette,tokens:legacyTokens(palette),id:id(),builtin:false,createdAt:t,updatedAt:t,deletedAt:null};store.db.insert(themeSets).values(row).run();return reply.code(201).send(row)})
 app.patch('/api/theme-sets/:id',async(req)=>{const key=param(req),old=store.theme(key);nonBuiltin(old);const input=themeInput.parse(req.body),palette=normalizePalette(input.palette,Object.keys(input.tokens).length?input.tokens:old.tokens);store.db.update(themeSets).set({...input,palette,tokens:legacyTokens(palette),updatedAt:now()}).where(eq(themeSets.id,key)).run();return store.theme(key)})
 app.delete('/api/theme-sets/:id',async(req)=>{const key=param(req),old=store.theme(key);if(old.builtin||key==='mine')fail(403,'不能删除内置套组或“我的资源”');store.sqlite.transaction(()=>{store.db.update(resources).set({themeSetId:'mine',updatedAt:now()}).where(eq(resources.themeSetId,key)).run();store.db.update(documents).set({themeSetId:'mine',updatedAt:now()}).where(eq(documents.themeSetId,key)).run();store.db.update(themeSets).set({deletedAt:now()}).where(eq(themeSets.id,key)).run()})();return{ok:true}})
 app.get('/api/resources',async(req)=>{
  const q=req.query as Record<string,string>;let rows=store.db.select().from(resources).orderBy(desc(resources.updatedAt)).all() as Resource[]
  rows=rows.filter(r=>q.trash==='true'?!!r.deletedAt:!r.deletedAt)
  if(q.themeSetId)rows=rows.filter(r=>r.themeSetId===q.themeSetId)
  if(q.kind)rows=rows.filter(r=>r.kind===q.kind)
  if(q.category)rows=rows.filter(r=>r.category===q.category)
  if(q.q){const term=q.q.toLowerCase();rows=rows.filter(r=>[r.name,r.description,r.category,...r.tags].join(' ').toLowerCase().includes(term))}
  return rows
 })
 app.get('/api/resources/:id',async(req)=>store.resource(param(req)))
 app.post('/api/resources',async(req,reply)=>reply.code(201).send(createResource(req.body)))
 app.put('/api/resources/:id',async(req)=>saveResource(param(req),resourceInput.parse(req.body)))
 app.post('/api/resources/:id/clone',async(req,reply)=>{const old=store.resource(param(req)),body=(req.body||{}) as any;return reply.code(201).send(createResource({...old,name:body.name||old.name+' 副本',themeSetId:body.themeSetId||'mine'}))})
 app.post('/api/resources/:id/apply-palette',async(req)=>{const card=store.resource(param(req));if(card.kind!=='palette')fail(400,'请选择配色卡');const body=z.object({themeSetId:z.string()}).parse(req.body);store.assertWritableTheme(body.themeSetId);const palette=normalizePalette(card.data.palette);store.db.update(themeSets).set({palette,tokens:legacyTokens(palette),updatedAt:now()}).where(eq(themeSets.id,body.themeSetId)).run();return store.theme(body.themeSetId)})
 app.delete('/api/resources/:id',async(req)=>{const r=store.resource(param(req));nonBuiltin(r);store.db.update(resources).set({deletedAt:now()}).where(eq(resources.id,r.id)).run();return{ok:true}})
 app.post('/api/resources/:id/restore',async(req)=>{const r=store.resource(param(req),true);nonBuiltin(r);store.db.update(resources).set({deletedAt:null,updatedAt:now()}).where(eq(resources.id,r.id)).run();return store.resource(r.id)})
 app.get('/api/resources/:id/versions',async(req)=>store.db.select().from(versions).where(and(eq(versions.entityType,'resource'),eq(versions.entityId,param(req)))).orderBy(desc(versions.revision)).all())
 app.post('/api/resources/:id/versions/:version/restore',async(req)=>{const key=param(req),p=req.params as any,v=store.db.select().from(versions).where(and(eq(versions.entityType,'resource'),eq(versions.entityId,key),eq(versions.revision,Number(p.version)))).get();if(!v)fail(404,'没有找到这个版本');return saveResource(key,resourceInput.parse({...v.payload,revision:(req.body as any)?.revision}))})
 app.get('/api/documents',async(req)=>{const q=req.query as any;return store.db.select().from(documents).orderBy(desc(documents.updatedAt)).all().filter(d=>q.trash==='true'?!!d.deletedAt:!d.deletedAt)})
 app.get('/api/documents/:id',async(req)=>store.document(param(req)))
 app.post('/api/documents',async(req,reply)=>{
  const body=(req.body||{}) as any
  if(body.resourceId){const r=store.resource(body.resourceId);if(r.kind==='palette')fail(400,'配色卡用于套组与组件，请选择组件或模板开始文章');const blocks=r.kind==='template'?r.data.blocks||[]:[{...r.data,id:id(),sourceComponentId:r.id,legacyId:r.legacyId,name:r.name,html:r.data.html!,assetIds:htmlAssetIds(r.data.html!)}];return reply.code(201).send(createDocument({title:body.title||r.name+' · 新稿',themeSetId:r.themeSetId,blocks:blocks.map(b=>({...b,id:id()}))}))}
  return reply.code(201).send(createDocument(body))
 })
 app.put('/api/documents/:id',async(req)=>saveDocument(param(req),documentInput.parse(req.body)))
 app.post('/api/documents/:id/clone',async(req)=>{const d=store.document(param(req));return createDocument({...d,title:d.title+' 副本',blocks:d.blocks.map(b=>({...b,id:id()}))})})
 app.delete('/api/documents/:id',async(req)=>{store.document(param(req));store.db.update(documents).set({deletedAt:now()}).where(eq(documents.id,param(req))).run();return{ok:true}})
 app.post('/api/documents/:id/restore',async(req)=>{store.document(param(req),true);store.db.update(documents).set({deletedAt:null}).where(eq(documents.id,param(req))).run();return store.document(param(req))})
 app.post('/api/documents/:id/template',async(req)=>{const d=store.document(param(req)),body=(req.body||{}) as any;return createResource({name:body.name||d.title,themeSetId:body.themeSetId||'mine',kind:'template',description:body.description||'',data:{blocks:d.blocks.map(b=>({...b,id:id()}))}})})
 app.get('/api/documents/:id/versions',async(req)=>store.db.select().from(versions).where(and(eq(versions.entityType,'document'),eq(versions.entityId,param(req)))).orderBy(desc(versions.revision)).all())
 app.post('/api/documents/:id/versions/:version/restore',async(req)=>{const p=req.params as any,v=store.db.select().from(versions).where(and(eq(versions.entityType,'document'),eq(versions.entityId,param(req)),eq(versions.revision,Number(p.version)))).get();if(!v)fail(404,'没有找到这个版本');return saveDocument(param(req),documentInput.parse({...v.payload,revision:(req.body as any)?.revision}))})
 app.post('/api/documents/import',async(req,reply)=>{
  const input=z.object({format:z.literal('neuq-shanhai-draft'),version:z.union([z.literal(1),z.literal(2)]),blocks:z.array(z.object({id:z.string(),html:z.string().optional()})).max(200),title:z.string().optional()}).parse(req.body)
  const blocks:Block[]=[]
  for(const b of input.blocks){const original=store.db.select().from(resources).where(eq(resources.id,'builtin-'+b.id)).get();let html=b.html||original?.data.html||''
   for(const asset of store.db.select().from(assets).all())if(asset.builtin)html=html.replaceAll('assets/'+asset.name,`/api/assets/${asset.id}/file`)
   html=await store.extractImages(html)
   blocks.push({id:id(),sourceComponentId:original?.id||null,legacyId:b.id,name:original?.name||'导入的自定义组件',html:sanitizeHtml(html),assetIds:htmlAssetIds(html)})
  }
  return reply.code(201).send(createDocument({title:input.title||'从山海知行导入的稿件',themeSetId:'shanhai',blocks}))
 })
 app.get('/api/documents/:id/export',async(req)=>{const d=store.document(param(req));return {title:d.title,html:await store.portable(articleHtml(d.blocks))}})
 app.post('/api/export',async(req)=>{const body=z.object({html:z.string().max(100_000_000)}).parse(req.body);return {html:await store.portable(body.html)}})
 app.get('/api/charts/render',async(req,reply)=>{const query=z.object({spec:z.string().max(18000)}).parse(req.query),chart=chartFromUrl('/api/charts/render?spec='+encodeURIComponent(query.spec));if(!chart)fail(400,'图表数据或格式无效');return reply.type('image/png').header('Cache-Control','private, max-age=86400').send(await renderChart(chart))})
 app.get('/api/assets',async(req)=>{const q=req.query as any;return store.db.select().from(assets).orderBy(desc(assets.createdAt)).all().filter(a=>q.trash==='true'?!!a.deletedAt:!a.deletedAt).filter(a=>!q.q||a.name.toLowerCase().includes(q.q.toLowerCase())).map(a=>({...a,references:store.references(a.id)}))})
 app.post('/api/assets',async(req,reply)=>{const part=await req.file();if(!part)fail(400,'请选择图片');const buffer=await part.toBuffer();return reply.code(201).send(await store.putAsset(buffer,part.filename))})
 app.get('/api/assets/:id',async(req)=>store.assetInfo(param(req)))
 app.post('/api/assets/:id/crop',async(req,reply)=>reply.code(201).send(await store.cropAsset(param(req),cropInputSchema.parse(req.body))))
 app.get('/api/assets/:id/references',async(req)=>{store.asset(param(req));return store.references(param(req))})
 app.get('/api/assets/:id/file',async(req,reply)=>{const a=store.asset(param(req));return reply.type(a.mime).header('Cache-Control','private, max-age=86400').send(createReadStream(resolve(store.config.dataDir,'uploads',a.fileName)))})
 app.get('/api/assets/:id/thumbnail',async(req,reply)=>{const a=store.asset(param(req)),file=resolve(store.config.dataDir,'thumbs',a.id+'.webp');return reply.type(existsSync(file)?'image/webp':a.mime).send(createReadStream(existsSync(file)?file:resolve(store.config.dataDir,'uploads',a.fileName)))})
 app.patch('/api/assets/:id',async(req)=>{const a=store.asset(param(req)),body=z.object({name:z.string().trim().min(1).max(150)}).parse(req.body);store.db.update(assets).set(body).where(eq(assets.id,a.id)).run();return store.asset(a.id)})
 app.delete('/api/assets/:id',async(req)=>{const a=store.asset(param(req));if(a.builtin)fail(403,'内置图片保留原件');if(store.references(a.id).length)fail(409,'这张图片仍被资源、文章或历史版本引用，暂时不能删除');store.db.update(assets).set({deletedAt:now()}).where(eq(assets.id,a.id)).run();return{ok:true}})
 app.post('/api/assets/:id/restore',async(req)=>{store.asset(param(req));store.db.update(assets).set({deletedAt:null}).where(eq(assets.id,param(req))).run();return store.asset(param(req))})
 app.get('/api/settings',()=>({model:store.db.select().from(settings).where(eq(settings.key,'model')).get()?.value||'deepseek-v4-pro',aiConfigured:!!store.config.apiKey,storage:'SQLite',version:'1.0.0',models,skill:readFileSync(resolve(store.config.root,'skills/component-design/SKILL.md'),'utf8')}))
 app.patch('/api/settings',async(req)=>{const body=z.object({model:z.enum(models)}).parse(req.body);store.db.insert(settings).values({key:'model',value:body.model}).onConflictDoUpdate({target:settings.key,set:{value:body.model}}).run();return{ok:true}})
 app.post('/api/settings/check-ai',async()=>{if(!store.config.apiKey)fail(503,'尚未读取到DeepSeek密钥');const r=await fetch(store.config.aiBase.replace(/\/$/,'')+'/models',{headers:{Authorization:`Bearer ${store.config.apiKey}`},signal:AbortSignal.timeout(15000)});if(!r.ok){await r.body?.cancel();fail(400,`DeepSeek连接未成功（HTTP ${r.status}）`)}const result:any=await r.json();return{ok:true,models:(result.data||[]).map((m:any)=>m.id)}})
 app.post('/api/ai/jobs',async(req,reply)=>reply.code(202).send(ai.create(aiInput.parse(req.body))))
 app.get('/api/ai/jobs',()=>store.db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(20).all())
 app.get('/api/ai/jobs/:id',async(req)=>ai.get(param(req)))
 app.post('/api/ai/jobs/:id/cancel',async(req)=>ai.cancel(param(req)))
 app.post('/api/ai/jobs/:id/apply',async(req)=>{
  const job=ai.get(param(req));if(job.status!=='ready'||!job.result)fail(409,'候选尚未完成或已经处理')
  const body=z.object({mode:z.enum(['save','insert','replace']),themeSetId:z.string().default('mine'),name:z.string().optional(),revision:z.number().int().optional()}).parse(req.body)
  const result=job.result;store.assertAssets(result.html)
  if(body.mode==='save'){const r=createResource({...result,name:body.name||result.name,themeSetId:body.themeSetId,kind:result.kind==='palette'?'palette':'component',data:result.kind==='palette'?{palette:result.palette}:{html:result.html,palette:result.palette,fields:result.fields,values:result.values,colorMappings:result.colorMappings}});ai.update(job.id,{status:'applied'});return{type:'resource',value:r}}
  if(result.kind==='palette')fail(400,'请先将配色保存为配色卡，再应用到套组或组件')
  const input=job.request;if(!input.targetId)fail(400,'这次制作没有指定目标文章或组件')
  const target=input.targetType==='document'?store.document(input.targetId):store.resource(input.targetId)
  store.checkRevision(target,input.targetRevision);store.checkRevision(target,body.revision)
  if(input.targetType==='resource'&&'data' in target&&target.kind==='component'){
   const r=saveResource(target.id,resourceInput.parse({...target,data:{...target.data,html:result.html,palette:result.palette,fields:result.fields,values:result.values,colorMappings:result.colorMappings},revision:target.revision}));ai.update(job.id,{status:'applied'});return{type:'resource',value:r}
  }
  const blocks:Block[]=structuredClone('blocks' in target?target.blocks:(target as Resource).data.blocks||[])
  const metadata={palette:result.palette,fields:result.fields,values:result.values,colorMappings:result.colorMappings}
  if(body.mode==='insert')blocks.push({...metadata,id:id(),sourceComponentId:null,name:result.name,html:result.html,assetIds:htmlAssetIds(result.html)})
  else {const b=blocks.find(b=>b.id===input.blockId);if(!b)fail(409,'原组件已被移除，请将候选另存为组件');Object.assign(b,metadata,{html:result.html,assetIds:htmlAssetIds(result.html)})}
  const value=input.targetType==='document'?saveDocument(target.id,documentInput.parse({...target,blocks,revision:target.revision})):saveResource(target.id,resourceInput.parse({...target,data:{blocks},revision:target.revision}))
  ai.update(job.id,{status:'applied'});return{type:input.targetType,value}
 })
 app.post('/api/backups',async(_req,reply)=>{const file=await makeBackup(store);return reply.type('application/zip').header('Content-Disposition',`attachment; filename="${file.split('/').pop()}"`).send(createReadStream(file))})
 app.post('/api/backups/restore',async(req)=>{
  if(ai.controllers.size)fail(409,'请先等待AI制作完成或取消任务，再恢复备份')
  const part=await req.file({limits:{fileSize:500*1024*1024}});if(!part)fail(400,'请选择秦编ZIP备份')
  const file=resolve(store.config.dataDir,'temporary',id()+'.zip')
  try{writeFileSync(file,await part.toBuffer());return await restoreBackup(store,file)}finally{if(existsSync(file))rmSync(file)}
 })
 return {app,store,ai}
}
