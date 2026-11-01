import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { prepareComponent, imageSlots, replaceImageSlot, centerCrop, sanitizeHtml, wechatHtml, type FieldDefinition } from '../packages/shared/src/index.ts'
import { cropImage } from '../apps/api/src/crop.ts'
import { createApp } from '../apps/api/src/app.ts'
import { makeBackup, restoreBackup } from '../apps/api/src/backup.ts'

const require=createRequire(new URL('../apps/api/package.json',import.meta.url))
const sharp:typeof import('../apps/api/node_modules/sharp')=require('sharp')
const portrait='<section style="padding:24px;background-color:#fffcf6;"><figure style="margin:0 0 16px;"><section data-qb-field="portrait" data-qb-field-type="image" style="width:120px;height:120px;margin:0 auto 0 0;background-color:#f0eae6;border-radius:50%;"></section></figure><div style="border-left:4px solid #c0202c;padding-left:16px;margin-bottom:16px;"><h2 style="margin:0;color:#563d7c;font-family:STSong,serif;font-size:24px;">张三</h2></div><div style="padding:16px;border-radius:8px;background-color:#f9e8e9;"><p style="font-family:KaiTi,serif;line-height:1.85;">人物简介</p></div></section>'
const field:FieldDefinition={id:'portrait',label:'人物图片',type:'image',default:'',suffix:''}
async function sourcePng(){const raw=Buffer.alloc(200*100*3);for(let y=0;y<100;y++)for(let x=0;x<200;x++){const at=(y*200+x)*3;raw[at]=x<100?255:0;raw[at+2]=x>=100?255:0}return sharp(raw,{raw:{width:200,height:100,channels:3}}).png().toBuffer()}

test('旧圆形图片字段替换为真实图片，保留宽度与位置，重复解析稳定',()=>{
 const empty=prepareComponent({html:portrait,fields:[field]})
 assert.deepEqual(empty.fields[0]?.image,{shape:'circle',ratio:1})
 const c=prepareComponent({...empty,values:{portrait:'/api/assets/example/file'}})
 assert.equal(imageSlots(c.html).length,1);assert.equal(imageSlots(c.html)[0]?.fieldId,'portrait')
 assert.match(c.html,/<img[^>]+data-qb-field="portrait"/)
 assert.match(c.html,/width:120px/);assert.match(c.html,/margin:0 auto 0 0/);assert.ok(!c.html.includes('background-color:#f0eae6'))
 assert.equal(prepareComponent(c).html,c.html)
 const changed=replaceImageSlot(c.html,0,'/api/assets/next/file','新图',{shape:'rect',ratio:4/3})
 const d=prepareComponent({...c,html:changed,values:{portrait:'/api/assets/next/file'}})
 assert.equal(imageSlots(d.html)[0]?.spec.shape,'rect');assert.equal(d.fields[0]?.image?.ratio,4/3)
 assert.ok(!sanitizeHtml(d.html,true).includes('data-qb-'))
})
test('微信导出转换旧容器，保留边框底色、间距和文字字体',()=>{
 const out=wechatHtml(sanitizeHtml(portrait,true))
 assert.ok(!/<\/?(?:div|figure|figcaption|h2)\b/.test(out))
 for(const css of ['border-left:4px solid #c0202c','padding-left:16px','margin-bottom:16px','background-color:#f9e8e9','padding:16px','border-radius:8px'])assert.ok(out.includes(css),css)
 assert.match(out,/<span[^>]+font-family:STSong,serif;[^>]*>张三/)
 assert.match(out,/<span[^>]+font-family:KaiTi,serif;[^>]*>人物简介/)
 assert.deepEqual(centerCrop(200,100,1),{x:.25,y:0,width:.5,height:1})
})
test('自动圆形裁切写入透明像素，手动取景改变裁切范围且不改原图',async()=>{
 const input=await sourcePng(),before=Buffer.from(input),out=await cropImage(input,{spec:{shape:'circle',ratio:1}})
 const meta=await sharp(out.buffer).metadata();assert.equal(meta.width,100);assert.equal(meta.height,100)
 const pixels=await sharp(out.buffer).ensureAlpha().raw().toBuffer();assert.equal(pixels[3],0);assert.equal(pixels[(50*100+50)*4+3],255)
 const left=await cropImage(input,{spec:{shape:'rect',ratio:1},rect:{x:0,y:0,width:.5,height:1}})
 const p=await sharp(left.buffer).raw().toBuffer();assert.equal(p[(50*100+50)*4],255);assert.deepEqual(input,before)
 await assert.rejects(()=>cropImage(input,{spec:{shape:'circle'},rect:{x:.8,y:0,width:.5,height:1}}))
})
test('GIF逐帧裁切保留帧数、循环、时长与透明圆形',async()=>{
 const raw=Buffer.alloc(100*60*2*4);for(let i=0;i<100*60*2;i++){raw[i*4+(i<100*60?0:2)]=255;raw[i*4+3]=255}
 const input=await sharp(raw,{raw:{width:100,height:120,channels:4,pageHeight:60}}).gif({delay:[80,160],loop:3}).toBuffer()
 const out=await cropImage(input,{spec:{shape:'circle',ratio:1}}),meta=await sharp(out.buffer,{animated:true}).metadata()
 assert.equal(meta.format,'gif');assert.equal(meta.pages,2);assert.equal(meta.pageHeight,60);assert.equal(meta.width,60);assert.equal(meta.loop,3);assert.deepEqual(meta.delay,[80,160])
 const pixels=await sharp(out.buffer,{animated:true}).ensureAlpha().raw().toBuffer();assert.equal(pixels[3],0);assert.equal(pixels[(30*60+30)*4],255);assert.equal(pixels[(60*60+30*60+30)*4+2],255)
})
test('裁切接口、旧稿导出、原图引用保护及备份恢复共用同一副本',async()=>{
 const root=resolve(import.meta.dirname,'..'),dataDir=mkdtempSync(join(tmpdir(),'qinbian-image-test-')),c=await createApp({root,seedDir:join(root,'seed'),dataDir,apiKey:''})
 try{
  const source=await c.store.putAsset(await sourcePng(),'测试原图.png'),url='/api/assets/'+source.id+'/file'
  const bad=await c.app.inject({method:'POST',url:`/api/assets/${source.id}/crop`,payload:{spec:{shape:'circle'},rect:{x:-1,y:0,width:1,height:1}}});assert.equal(bad.statusCode,400)
  const crop=await c.app.inject({method:'POST',url:`/api/assets/${source.id}/crop`,payload:{spec:{shape:'circle',ratio:1}}});assert.equal(crop.statusCode,201)
  const a=crop.json();assert.equal(a.sourceAssetId,source.id);assert.deepEqual(a.crop.rect,{x:.25,y:0,width:.5,height:1})
  assert.equal((await c.app.inject({method:'DELETE',url:`/api/assets/${source.id}`})).statusCode,409)
  const html=prepareComponent({html:portrait,fields:[field],values:{portrait:url}}).html
  const exportResult=(await c.app.inject({method:'POST',url:'/api/export',payload:{html}})).json().html
  assert.ok(exportResult.includes('background-color:#f9e8e9'));assert.ok(!exportResult.includes('<div'));assert.ok(!exportResult.includes('data-qb-'))
  const encoded=exportResult.match(/src="data:image\/png;base64,([^"]+)"/)[1],pixels=await sharp(Buffer.from(encoded,'base64')).ensureAlpha().raw().toBuffer();assert.equal(pixels[3],0)
  const count=(await c.app.inject('/api/assets')).json().length;await c.store.portable(html);assert.equal((await c.app.inject('/api/assets')).json().length,count)
  const backup=await makeBackup(c.store);await restoreBackup(c.store,backup)
  assert.equal(c.store.asset(a.id).sourceAssetId,source.id);assert.deepEqual(c.store.asset(a.id).crop,a.crop)
  assert.deepEqual(readFileSync(join(dataDir,'uploads',source.fileName)),await sourcePng())
 }finally{await c.app.close();rmSync(dataDir,{recursive:true,force:true})}
})
