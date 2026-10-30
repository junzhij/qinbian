import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { inspectHtml, rules, prepareComponent, componentSettingsSchema, normalizePalette, makeColor, paletteSchema, paletteEntries, extractFieldValues, type AiInput, type AiJob } from '@qinbian/shared'
import { Store, id, now, fail } from './store.ts'
import { jobs, resources, settings } from './schema.ts'

const resultSchema=z.object({name:z.string().min(1).max(100),description:z.string().max(1000).default(''),category:z.string().max(100).default('正文与导读'),tags:z.array(z.string().max(40)).max(20).default([]),html:z.string().min(1).max(500_000),...componentSettingsSchema.partial().shape})
const paletteResult=z.object({name:z.string().min(1).max(100),description:z.string().max(1000).default(''),colors:z.array(z.object({id:z.string().regex(/^color[1-6]$/),name:z.string().min(1).max(40),regular:z.string().regex(/^#[\da-fA-F]{6}$/),highlight:z.string().regex(/^#[\da-fA-F]{6}$/).optional(),light:z.string().regex(/^#[\da-fA-F]{6}$/).optional()})).min(3).max(6)})
export class AiService {
 controllers=new Map<string,AbortController>()
 constructor(public store:Store){}
 get(key:string):AiJob{const job=this.store.db.select().from(jobs).where(eq(jobs.id,key)).get();if(!job)fail(404,'没有找到这次AI制作');return job as AiJob}
 update(key:string,patch:Partial<typeof jobs.$inferInsert>){this.store.db.update(jobs).set({...patch,updatedAt:now()}).where(eq(jobs.id,key)).run()}
 create(input:AiInput){
  const choices=[...input.prompt.matchAll(/([三四五六3-6])(?:种|个)?色/g)].filter(m=>!/(?:不要|不用|不使用|避免|非)$/.test(input.prompt.slice(Math.max(0,m.index!-5),m.index)))
  const choice=choices.at(-1)?.[1]
  if(choice)input={...input,colorCount:({三:3,四:4,五:5,六:6} as Record<string,number>)[choice]||Number(choice)}
  if(!this.store.config.apiKey)fail(503,'尚未读取到DeepSeek密钥，请检查env文件')
  if(this.controllers.size)fail(429,'已有一项AI制作正在进行，请等待完成或先取消')
  this.store.theme(input.themeSetId)
  if(input.operation==='edit'&&!input.sourceHtml&&!input.targetId)fail(400,'请选择需要修改的组件')
  if(input.targetId){const target=input.targetType==='document'?this.store.document(input.targetId):this.store.resource(input.targetId);this.store.checkRevision(target,input.targetRevision)}
  for(const key of input.assetIds)this.store.asset(key)
  const model=input.model||this.store.db.select().from(settings).where(eq(settings.key,'model')).get()?.value||'deepseek-v4-pro'
  const key=id(),t=now();const controller=new AbortController();this.controllers.set(key,controller)
  this.store.db.insert(jobs).values({id:key,operation:input.operation,status:'queued',model,request:input,result:null,error:null,usage:null,createdAt:t,updatedAt:t}).run()
  setImmediate(()=>void this.run(key,controller));return this.get(key)
 }
 cancel(key:string){const job=this.get(key);if(['applied','failed','cancelled'].includes(job.status))return job;this.controllers.get(key)?.abort();this.update(key,{status:'cancelled',error:null});return this.get(key)}
 async run(key:string,controller:AbortController){
  try{
   const job=this.get(key),input=job.request,theme=this.store.theme(input.themeSetId)
   let skill=readFileSync(resolve(this.store.config.root,'skills/component-design/SKILL.md'),'utf8')
   let source=input.sourceHtml,sourceSettings:any=input.settings||{}
   if(!source&&input.targetId){const target=input.targetType==='document'?this.store.document(input.targetId):this.store.resource(input.targetId);source='blocks' in target?target.blocks.find(b=>b.id===input.blockId)?.html:target.data.html||target.data.blocks?.find(b=>b.id===input.blockId)?.html}
   if(input.targetId&&!input.settings){const target=input.targetType==='document'?this.store.document(input.targetId):this.store.resource(input.targetId);sourceSettings='blocks' in target?target.blocks.find(b=>b.id===input.blockId)||{}:target.kind==='component'?target.data:target.data.blocks?.find(b=>b.id===input.blockId)||{}}
   const chartIntent=input.operation!=='palette'&&(input.designKind==='chart'||!!source?.includes('data-qb-chart')||/折线图|面积图|柱状图|条形图|饼图|环图|数据图|\b(?:line|area|bar|pie|donut)\b/i.test(input.prompt))
   const dividerIntent=input.operation!=='palette'&&(input.designKind==='divider'||/分隔符|分隔线|分割线|\bdivider\b/i.test(input.prompt))
   if(chartIntent)skill+='\n\n'+readFileSync(resolve(this.store.config.root,'skills/component-design/references/data-charts.md'),'utf8')
   if(dividerIntent)skill+='\n\n'+readFileSync(resolve(this.store.config.root,'skills/component-design/references/dividers.md'),'utf8')
   const all=this.store.db.select().from(resources).where(eq(resources.kind,'component')).all().filter(r=>!r.deletedAt)
   const examples=(input.referenceIds.length?input.referenceIds.map(k=>this.store.resource(k)):all.filter(r=>r.themeSetId===theme.id&&(!chartIntent||r.data.html?.includes('data-qb-chart'))&&(!dividerIntent||r.category==='章节与分隔'||r.tags.includes('分隔符')))).slice(0,2).map(r=>({name:r.name,html:r.data.html}))
   const assets=input.assetIds.map(k=>{const a=this.store.asset(k);return {id:a.id,name:a.name,width:a.width,height:a.height,url:`/api/assets/${a.id}/file`}})
   let palette=normalizePalette(input.palette||sourceSettings.palette||theme.palette,theme.tokens)
   if(input.colorCount){palette={...palette,colors:palette.colors.slice(0,input.colorCount)};while(palette.colors.length<input.colorCount){const n=palette.colors.length+1;palette.colors.push(makeColor(`color${n}`,['墨蓝','灰青','朱砂','浅金','黛紫','石青'][n-1]!,['#183A49','#567067','#9E4B3B','#B38A55','#8A8393','#5B8790'][n-1]!))}}
   const payload={operation:input.operation,request:input.prompt,theme:{name:theme.name,rules:theme.rules},palette,paletteTokens:paletteEntries(palette),colorCount:input.colorCount||palette.colors.length,typography:rules.typography,fields:sourceSettings.fields||[],values:sourceSettings.values||{},assets,examples,sourceHtml:source||null}
   const modeRules=input.operation==='palette'?'本次只生成配色卡，不生成HTML。返回JSON {name,description,colors:[{id:"color1",name:"颜色中文名",regular:"#RRGGBB",highlight:"#RRGGBB",light:"#RRGGBB"}]}。颜色数量必须等于请求colorCount，范围3至6；同一颜色的三档需协调，名称自由、有辨识度。':'本次生成完整组件JSON。颜色优先用style中的{{color1-regular}}、{{color2-highlight}}、{{color3-light}}占位符或data-qb-styles映射，不把主题色写死；数值和文案用fields和data-qb-field，修改时保留原有字段标记。'
   const messages:{role:string;content:string}[]=[{role:'system',content:skill+'\n\n'+modeRules},{role:'user',content:JSON.stringify(payload)}]
   for(let attempt=0;attempt<2;attempt++){
    if(controller.signal.aborted)return
    this.update(key,{status:'running'})
    const response=await fetch(this.store.config.aiBase.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.store.config.apiKey}`},body:JSON.stringify({model:job.model,messages,response_format:{type:'json_object'},thinking:{type:'disabled'},max_tokens:12000,stream:false}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(this.store.config.aiTimeout)])})
    if(!response.ok){await response.body?.cancel();throw new Error(`DeepSeek请求失败（HTTP ${response.status}）。请检查密钥、额度或模型可用性后重试。`)}
    const data:any=await response.json();if(controller.signal.aborted)return
    this.update(key,{status:'validating',usage:data.usage||null})
    const raw=data.choices?.[0]?.message?.content||''
    try{
     if(data.choices?.[0]?.finish_reason==='length')throw new Error('模型输出被截断，请缩小组件范围')
     if(input.operation==='palette'){
      const generated=paletteResult.parse(JSON.parse(raw));if(generated.colors.length!==payload.colorCount)throw new Error(`请返回${payload.colorCount}个颜色`)
      const p=paletteSchema.parse({name:generated.name,colors:generated.colors.map(c=>({...makeColor(c.id,c.name,c.regular),...c}))})
      this.update(key,{status:'ready',result:{kind:'palette',name:generated.name,description:generated.description,category:'配色卡',tags:['配色'],html:'',palette:p},error:null});return
     }
     const result=resultSchema.parse(JSON.parse(raw));if(chartIntent&&!result.html.includes('data-qb-chart'))throw new Error('数据图必须使用data-qb-chart协议，不能用空圆或CSS渐变代替');if(chartIntent)result.category='数据与清单';if(dividerIntent){result.category='章节与分隔';result.tags=[...new Set([...result.tags,'分隔符'])]}const fields=result.fields||sourceSettings.fields||[]
     const metadata=prepareComponent({...sourceSettings,...result,palette,fields,values:{...sourceSettings.values,...result.values,...extractFieldValues(result.html,fields)}})
     const checked=inspectHtml(metadata.html)
     if(checked.issues.length)throw new Error(checked.issues.join('；'))
     this.store.assertAssets(checked.html)
     this.update(key,{status:'ready',result:{...result,...metadata,kind:'component',html:checked.html},error:null});return
    }catch(error){
     if(attempt===1)throw new Error('候选未通过检查，原内容未改变。'+(error instanceof z.ZodError?'输出字段不完整':error instanceof Error?error.message:'请修改需求后重试'))
     messages.push({role:'assistant',content:raw.slice(0,80_000)},{role:'user',content:`仅修复此次校验错误并返回同样字段的完整JSON，不添加新信息：${error instanceof z.ZodError?'JSON字段不完整':error instanceof Error?error.message:'JSON格式无效'}`})
    }
   }
  }catch(error){if(!controller.signal.aborted&&this.get(key).status!=='cancelled'){const message=error instanceof Error?error.message:'AI制作暂未完成，请重试';this.update(key,{status:'failed',error:message.replaceAll(this.store.config.apiKey,'[已隐藏]').slice(0,500)})}}
  finally{this.controllers.delete(key)}
 }
 close(){for(const controller of this.controllers.values())controller.abort();this.controllers.clear()}
}
