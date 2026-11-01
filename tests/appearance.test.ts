import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createApp } from '../apps/api/src/app.ts'
import { articleHtml, normalizeAppearance, type ResolvedChart } from '../packages/shared/src/index.ts'
import { renderChart } from '../apps/api/src/charts.ts'
const require=createRequire(new URL('../apps/api/package.json',import.meta.url)),Database=require('better-sqlite3'),sharp:typeof import('../apps/api/node_modules/sharp')=require('sharp')
const root=resolve(import.meta.dirname,'..')
test('文章背景在保存、复制、模板复用及导出中保留，拒绝样式注入',async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'qinbian-appearance-')),c=await createApp({root,seedDir:join(root,'seed'),dataDir,apiKey:''})
 try{
  const blocks=[{id:'sample',name:'测试',html:'<section style="background-color:#FFFFFF;padding:16px;"><p>内层卡片</p></section>',assetIds:[]}]
  const created=await c.app.inject({method:'POST',url:'/api/documents',payload:{title:'整体背景',blocks,appearance:{backgroundColor:'#eef3eb'}}});assert.equal(created.statusCode,201)
  const d=created.json();assert.equal(d.appearance.backgroundColor,'#EEF3EB')
  const output=(await c.app.inject('/api/documents/'+d.id+'/export')).json().html;assert.ok(output.includes('background-color:#EEF3EB'));assert.ok(output.includes('background-color:#FFFFFF'))
  const copy=(await c.app.inject({method:'POST',url:'/api/documents/'+d.id+'/clone'})).json();assert.deepEqual(copy.appearance,d.appearance)
  const template=(await c.app.inject({method:'POST',url:'/api/documents/'+d.id+'/template',payload:{name:'背景模板'}})).json();assert.deepEqual(template.data.appearance,d.appearance)
  const applied=(await c.app.inject({method:'POST',url:'/api/documents',payload:{resourceId:template.id}})).json();assert.deepEqual(applied.appearance,d.appearance)
  const bad=await c.app.inject({method:'PUT',url:'/api/documents/'+d.id,payload:{...d,appearance:{backgroundColor:'#fff;background-image:url(https://bad.test)'}}});assert.equal(bad.statusCode,400);assert.equal(c.store.document(d.id).revision,1)
  assert.equal(normalizeAppearance().backgroundColor,'#FFFFFF');assert.ok(articleHtml([],{backgroundColor:'#ABCDEF'}).includes('background-color:#ABCDEF'))
 }finally{await c.app.close();rmSync(dataDir,{recursive:true,force:true})}
})
test('旧数据库迁移默认白色背景，不改变已有文章内容',async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'qinbian-old-appearance-')),db=new Database(join(dataDir,'qinbian.sqlite'))
 db.exec('CREATE TABLE _migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)')
 for(const name of ['0001_initial.sql','0002_palette_bindings.sql','0003_image_crops.sql']){db.exec(readFileSync(join(root,'apps/api/migrations',name),'utf8'));db.prepare('INSERT INTO _migrations VALUES (?,?)').run(name,'2026-10-30')}
 db.prepare('INSERT INTO theme_sets(id,name,description,builtin,tokens,rules,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('mine','旧套组','',0,'{}','','2026-10-30','2026-10-30')
 db.prepare('INSERT INTO documents(id,title,theme_set_id,blocks,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('old','旧文章','mine','[]',3,'2026-10-30','2026-10-30');db.close()
 const c=await createApp({root,seedDir:join(root,'seed'),dataDir,apiKey:''})
 try{const old=c.store.document('old');assert.equal(old.revision,3);assert.equal(old.title,'旧文章');assert.deepEqual(old.blocks,[]);assert.deepEqual(old.appearance,{backgroundColor:'#FFFFFF'})}finally{await c.app.close();rmSync(dataDir,{recursive:true,force:true})}
})
test('图表背景与环图中心透明，可叠在整篇背景上',async()=>{
 const chart:ResolvedChart={type:'donut',labels:['甲','乙'],series:[{name:'示例',values:[1,3]}],colors:['#ff0000','#0000ff'],unit:''},buffer=await renderChart(chart),image=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 assert.equal(image.data[3],0)
 const center=((119*2)*image.info.width+113*2)*4;assert.equal(image.data[center+3],0)
})
