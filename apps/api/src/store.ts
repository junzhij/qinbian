import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { mkdirSync, readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { renderChart } from './charts.ts'
import { cropImage } from './crop.ts'
import * as schema from './schema.ts'
import type { Config } from './config.ts'
import { assetUrl, sanitizeHtml, wechatHtml, materializeImages, cropInputSchema, centerCrop, chartFromUrl, htmlAssetIds, normalizePalette, prepareComponent, defaultPalette, paletteEntries, normalizeHex, type Block, type Resource, type Article, type Asset, type Palette } from '@qinbian/shared'

export const now=()=>new Date().toISOString()
export const id=()=>randomUUID()
export function fail(statusCode:number,message:string):never{throw Object.assign(new Error(message),{statusCode})}
export class Store {
 sqlite!:Database.Database
 db!:BetterSQLite3Database<typeof schema>
 restoring=false
 constructor(public config:Config){
  for(const p of ['uploads','thumbs','backups','temporary'])mkdirSync(resolve(config.dataDir,p),{recursive:true})
  this.open()
 }
 open(){
  this.sqlite=new Database(resolve(this.config.dataDir,'qinbian.sqlite'))
  this.sqlite.pragma('journal_mode = WAL');this.sqlite.pragma('foreign_keys = ON');this.sqlite.pragma('busy_timeout = 5000')
  this.sqlite.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const dir=resolve(this.config.root,'apps/api/migrations')
  for(const name of readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())if(!this.sqlite.prepare('SELECT name FROM _migrations WHERE name=?').get(name)){
   this.sqlite.transaction(()=>{this.sqlite.exec(readFileSync(resolve(dir,name),'utf8'));this.sqlite.prepare('INSERT INTO _migrations VALUES (?,?)').run(name,now())})()
  }
  this.db=drizzle(this.sqlite,{schema})
 }
 close(){this.sqlite.close()}
 resource(key:string,includeDeleted=false):Resource {const row=this.db.select().from(schema.resources).where(eq(schema.resources.id,key)).get();if(!row||(!includeDeleted&&row.deletedAt))fail(404,'没有找到这份资源');return row as Resource}
 document(key:string,includeDeleted=false):Article {const row=this.db.select().from(schema.documents).where(eq(schema.documents.id,key)).get();if(!row||(!includeDeleted&&row.deletedAt))fail(404,'没有找到这篇文章');return row as Article}
 asset(key:string):Asset {const row=this.db.select().from(schema.assets).where(eq(schema.assets.id,key)).get();if(!row)fail(404,'没有找到图片');return row}
 theme(key:string){const t=this.db.select().from(schema.themeSets).where(eq(schema.themeSets.id,key)).get();if(!t||t.deletedAt)fail(404,'没有找到主题套组');return t}
 assertWritableTheme(key:string){const t=this.theme(key);if(t.builtin)fail(403,'内置套组保留原件，请选择“我的资源”或自建套组')}
 checkRevision(current:{revision:number},revision?:number){if(revision!==current.revision)fail(409,'内容已更新，请重新载入或将当前内容另存，避免覆盖新版本')}
 record(type:string,payload:any){this.db.insert(schema.versions).values({id:id(),entityType:type,entityId:payload.id,revision:payload.revision,payload,createdAt:now()}).onConflictDoNothing().run()}
 references(assetId:string){
  const refs:{type:string;id:string;name:string}[]=[]
  for(const a of this.db.select().from(schema.assets).all())if(a.sourceAssetId===assetId&&!a.deletedAt)refs.push({type:'asset',id:a.id,name:a.name+'（裁切副本）'})
  for(const r of this.db.select().from(schema.resources).all())if(JSON.stringify(r.data).includes(assetUrl(assetId)))refs.push({type:'resource',id:r.id,name:r.name+(r.deletedAt?'（回收站）':'')})
  for(const d of this.db.select().from(schema.documents).all())if(JSON.stringify(d.blocks).includes(assetUrl(assetId)))refs.push({type:'document',id:d.id,name:d.title+(d.deletedAt?'（回收站）':'')})
  for(const v of this.db.select().from(schema.versions).all())if(JSON.stringify(v.payload).includes(assetUrl(assetId))&&!refs.some(r=>r.id===v.entityId))refs.push({type:'version',id:v.entityId,name:'历史版本中的图片'})
  return refs
 }
 assertAssets(html:string){for(const a of htmlAssetIds(html)){const row=this.asset(a);if(row.deletedAt)fail(400,'组件引用了已删除的图片')}}
 normalizeBlocks(blocks:Block[]){return blocks.map(b=>{const data=prepareComponent(b,b.palette||this.bestPalette(b.html));this.assertAssets(data.html);return {...b,...data,id:b.id||id(),assetIds:htmlAssetIds(data.html)}})}
 bestPalette(html:string,fallback?:Palette){
  const candidates=[...(fallback?[fallback]:[]),...this.db.select().from(schema.themeSets).all().filter(t=>!t.deletedAt).map(t=>normalizePalette(t.palette,t.tokens))]
  const colors=[...html.matchAll(/#[\da-fA-F]{3,6}\b|rgb\([^)]*\)/g)].map(m=>normalizeHex(m[0])).filter(Boolean)
  const score=(p:Palette)=>{const set=new Set(paletteEntries(p).map(c=>normalizeHex(c.value)));return colors.filter(c=>set.has(c)).length}
  return candidates.sort((a,b)=>score(b)-score(a))[0]||defaultPalette
 }
 async putAsset(buffer:Buffer,name:string,builtin=false){
  if(buffer.length>20*1024*1024)fail(413,'单张图片请控制在20 MB以内')
  let info:sharp.Metadata
  try{info=await sharp(buffer,{animated:false,limitInputPixels:80_000_000}).metadata()}catch{fail(400,'无法读取图片，请使用JPG、PNG、WebP或GIF')}
  const mime=({jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'} as Record<string,string>)[info.format||'']
  if(!mime)fail(400,'请选择JPG、PNG、WebP或GIF图片')
  const hash=createHash('sha256').update(buffer).digest('hex')
  const old=this.db.select().from(schema.assets).where(eq(schema.assets.hash,hash)).get()
  if(old){if(old.deletedAt)this.db.update(schema.assets).set({deletedAt:null}).where(eq(schema.assets.id,old.id)).run();return {...old,deletedAt:null}}
  const key=id(), fileName=hash+(({jpeg:'.jpg',png:'.png',gif:'.gif',webp:'.webp'} as Record<string,string>)[info.format!]||extname(name))
  writeFileSync(resolve(this.config.dataDir,'uploads',fileName),buffer)
  await sharp(buffer,{animated:false}).rotate().resize({width:480,height:360,fit:'inside',withoutEnlargement:true}).webp({quality:75}).toFile(resolve(this.config.dataDir,'thumbs',key+'.webp'))
  const row={id:key,name:name.slice(0,150),fileName,mime,bytes:buffer.length,width:(info.orientation&&info.orientation>=5?info.height:info.width)||0,height:(info.orientation&&info.orientation>=5?info.width:info.pageHeight||info.height)||0,hash,builtin,createdAt:now(),deletedAt:null}
  this.db.insert(schema.assets).values(row).run();return row
 }
 async assetInfo(key:string){const a=this.asset(key),m=await sharp(readFileSync(resolve(this.config.dataDir,'uploads',a.fileName)),{animated:false}).metadata(),swap=!!m.orientation&&m.orientation>=5&&m.orientation<=8;return{...a,width:(swap?m.height:m.width)||a.width,height:(swap?m.width:m.pageHeight||m.height)||a.height}}
 async cropAsset(key:string,raw:unknown){
  const request=cropInputSchema.parse(raw)
  let source=this.asset(key)
  if(source.deletedAt)fail(400,'原图已在回收站，请先恢复')
  const seen=new Set<string>()
  while(source.sourceAssetId&&!seen.has(source.id)){seen.add(source.id);source=this.asset(source.sourceAssetId)}
  const spec={...request.spec,...(request.spec.shape==='circle'?{ratio:1}:{})},rect=request.rect||centerCrop(source.width,source.height,spec.ratio)
  const existing=this.db.select().from(schema.assets).all().find(a=>a.sourceAssetId===source.id&&!a.deletedAt&&a.crop?.spec.shape===spec.shape&&(a.crop.spec.ratio||0)===(spec.ratio||0)&&(a.crop.spec.radius??.08)===(spec.radius??.08)&&Object.keys(rect).every(k=>Math.abs(a.crop!.rect[k as keyof typeof rect]-rect[k as keyof typeof rect])<.000001))
  if(existing)return existing
  const result=await cropImage(readFileSync(resolve(this.config.dataDir,'uploads',source.fileName)),request)
  const a:Asset=await this.putAsset(result.buffer,source.name.replace(/\.[^.]+$/,'')+' · '+({rect:'裁切',circle:'圆形裁切',rounded:'圆角裁切'}[result.spec.shape])+'.'+result.extension)
  if(a.id!==source.id&&!a.sourceAssetId)this.db.update(schema.assets).set({sourceAssetId:source.id,crop:{spec:result.spec,rect:result.rect}}).where(eq(schema.assets.id,a.id)).run()
  return this.asset(a.id)
 }
 async extractImages(html:string){
  const matches=[...html.matchAll(/\bsrc=(["'])(data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+)\1/g)]
  for(const m of matches){const data=m[2],buffer=Buffer.from(data.slice(data.indexOf(',')+1),'base64');const a=await this.putAsset(buffer,'导入的图片');html=html.replaceAll(data,assetUrl(a.id))}
  return html
 }
 async seed(){
  const t=now(),lib=JSON.parse(readFileSync(resolve(this.config.seedDir,'library.json'),'utf8'))
  this.db.insert(schema.themeSets).values({id:'shanhai',name:'山海知行',description:'山海之间，知行成章。东秦校园图文主题。',builtin:true,tokens:lib.theme.palette,rules:'正文15px，行距1.85；深海蓝、海沫青与沙金；标题16至24px，系统中文字体。',createdAt:t,updatedAt:t,deletedAt:null}).onConflictDoNothing().run()
  this.db.insert(schema.themeSets).values({id:'mine',name:'我的资源',description:'收藏灵感，也留下自己的章法。',builtin:false,tokens:{墨蓝:'#183A49',灰青:'#567067',朱砂:'#9E4B3B',纸白:'#FFFCF6'},rules:'克制配色，清晰层级，舒展留白。',createdAt:t,updatedAt:t,deletedAt:null}).onConflictDoNothing().run()
  for(const theme of this.db.select().from(schema.themeSets).all())if(!theme.palette)this.db.update(schema.themeSets).set({palette:normalizePalette(undefined,theme.tokens)}).where(eq(schema.themeSets.id,theme.id)).run()
  const files:Record<string,string>={}
  for(const name of readdirSync(resolve(this.config.seedDir,'assets'))){const a=await this.putAsset(readFileSync(resolve(this.config.seedDir,'assets',name)),name,true);files[name]=assetUrl(a.id)}
  for(const c of lib.components){
   let html=c.html as string
   for(const [name,url]of Object.entries(files))html=html.replaceAll('assets/'+name,url)
   if(c.id==='G04')html=html.replace('<section ', '<section data-ratio="true" ')
   this.db.insert(schema.resources).values({id:'builtin-'+c.id,themeSetId:'shanhai',kind:'component',name:c.name,description:c.description,category:c.categoryLabel,tags:c.tags,legacyId:c.id,builtin:true,data:{html:sanitizeHtml(html)},revision:1,createdAt:t,updatedAt:t,deletedAt:null}).onConflictDoNothing().run()
  }
  for(const recipe of lib.recipes){
   const blocks=recipe.ids.map((legacy:string,i:number)=>{const r=this.resource('builtin-'+legacy);return {id:`${recipe.id}-${i}`,sourceComponentId:r.id,legacyId:legacy,name:r.name,html:r.data.html!,assetIds:htmlAssetIds(r.data.html!)}})
   this.db.insert(schema.resources).values({id:'template-'+recipe.id,themeSetId:'shanhai',kind:'template',name:recipe.name,description:recipe.description,category:'编排模板',tags:[recipe.name],legacyId:'recipe-'+recipe.id,builtin:true,data:{blocks},revision:1,createdAt:t,updatedAt:t,deletedAt:null}).onConflictDoNothing().run()
  }
  for(const r of this.db.select().from(schema.resources).all())if(r.kind==='component'&&!r.data.palette){const data=prepareComponent(r.data,this.bestPalette(r.data.html||''));this.db.update(schema.resources).set({data}).where(eq(schema.resources.id,r.id)).run()}
  for(const r of this.db.select().from(schema.resources).all())if(r.kind==='template'&&r.data.blocks?.some((b:Block)=>!b.palette))this.db.update(schema.resources).set({data:{...r.data,blocks:this.normalizeBlocks(r.data.blocks)}}).where(eq(schema.resources.id,r.id)).run()
  for(const d of this.db.select().from(schema.documents).all())if(d.blocks.some((b:Block)=>!b.palette))this.db.update(schema.documents).set({blocks:this.normalizeBlocks(d.blocks)}).where(eq(schema.documents.id,d.id)).run()
  for(const p of [{id:'palette-shanhai',name:'山海原色',palette:normalizePalette(this.theme('shanhai').palette)}, {id:'palette-qingjin',name:'青衿纸墨',palette:defaultPalette}])this.db.insert(schema.resources).values({id:p.id,themeSetId:'shanhai',kind:'palette',name:p.name,description:'可复用的校园图文配色，每色含主题、强调与减淡三档。',category:'配色卡',tags:['配色'],legacyId:p.id,builtin:true,data:{palette:p.palette},revision:1,createdAt:t,updatedAt:t,deletedAt:null}).onConflictDoNothing().run()
  this.db.insert(schema.settings).values({key:'model',value:'deepseek-v4-pro'}).onConflictDoNothing().run()
  this.db.update(schema.jobs).set({status:'failed',error:'应用重新启动，未完成的任务已停止。可以手动重试。',updatedAt:now()}).where(eq(schema.jobs.status,'running')).run()
  for(const status of ['queued','validating'])this.db.update(schema.jobs).set({status:'failed',error:'应用重新启动，未完成的任务已停止。',updatedAt:now()}).where(eq(schema.jobs.status,status)).run()
 }
 async portable(html:string){
  html=await materializeImages(sanitizeHtml(html),async(src,spec)=>{
   const chart=chartFromUrl(src);if(chart)return 'data:image/png;base64,'+(await renderChart(chart)).toString('base64')
   const key=src.match(/^\/api\/assets\/([a-zA-Z0-9_-]+)\/file$/)?.[1]
   if(key&&(spec.shape!=='rect'||spec.ratio)){
    const a=this.asset(key),crop=a.crop
    if(!crop||crop.spec.shape!==spec.shape||Math.abs((crop.spec.ratio||a.width/a.height)-(spec.ratio||a.width/a.height))>.001||spec.shape==='rounded'&&(crop.spec.radius??.08)!==(spec.radius??.08))src=assetUrl((await this.cropAsset(key,{spec})).id)
   }
   return src
  })
  html=wechatHtml(sanitizeHtml(html,true))
  for(const key of htmlAssetIds(html)){const a=this.asset(key);const data=readFileSync(resolve(this.config.dataDir,'uploads',a.fileName)).toString('base64');html=html.replaceAll(assetUrl(key),`data:${a.mime};base64,${data}`)}
  return html
 }
}
