import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { chartSchema, chartUrl, chartFromUrl, chartTypes, prepareComponent, extractFieldValues, defaultPalette, usedColorTokens, makeDivider, dividerStyles, componentInitial, filterComponents, sanitizeHtml, type ResolvedChart } from '../packages/shared/src/index.ts'
import { chartSvg, renderChart } from '../apps/api/src/charts.ts'
import { createApp } from '../apps/api/src/app.ts'
const require=createRequire(new URL('../apps/api/package.json',import.meta.url)),sharp:typeof import('../apps/api/node_modules/sharp')=require('sharp')
const spec={type:'pie' as const,labels:['{{label1}}','{{label2}}'],series:[{name:'人数',values:['{{v1}}','{{v2}}']}],colors:['color1-regular','color2-regular'],unit:'人'}
const data=()=>prepareComponent({html:`<section style="padding:16px;"><section data-qb-chart='${JSON.stringify(spec)}'></section><p><span leaf="">示例数据，使用前请替换</span></p></section>`,fields:[{id:'label1',type:'text',default:'甲类',label:'分类一',suffix:''},{id:'label2',type:'text',default:'乙类',label:'分类二',suffix:''},{id:'v1',type:'number',default:25,label:'人数一',suffix:'人'},{id:'v2',type:'number',default:75,label:'人数二',suffix:'人'}]})
test('图表数据校验拒绝错位分类、负数饼图和伪造图片地址',()=>{
 assert.equal(chartSchema.safeParse({...spec,labels:['甲'],series:[{name:'人数',values:[1,2]}]}).success,false)
 assert.equal(chartSchema.safeParse({...spec,labels:['甲','乙'],series:[{name:'人数',values:[-1,2]}]}).success,false)
 assert.equal(chartFromUrl('/api/charts/render?spec=not-json'),null)
 assert.equal(chartFromUrl('/api/charts/render?spec='+encodeURIComponent(JSON.stringify({...spec,colors:['javascript:bad']}))),null)
})
test('数值、分类与配色修改会重绘，图例数值保持可编辑的原始值',()=>{
 const c=data(),src=c.html.match(/src="([^"]+)"/)![1]!,chart=chartFromUrl(src)!
 assert.deepEqual(chart.labels,['甲类','乙类']);assert.deepEqual(chart.series[0]!.values,[25,75])
 assert.deepEqual(extractFieldValues(c.html,c.fields),{label1:'甲类',label2:'乙类',v1:25,v2:75})
 assert.ok(c.html.includes('人'));assert.deepEqual(usedColorTokens(c.html),['color1-regular','color2-regular'])
 const changed=prepareComponent({...c,values:{...c.values,v1:75,label1:'新分类'},colorMappings:{'color1-regular':'#445566'}}),next=chartFromUrl(changed.html.match(/src="([^"]+)"/)![1]!)!
 assert.deepEqual(next.series[0]!.values,[75,75]);assert.equal(next.labels[0],'新分类');assert.equal(next.colors[0],'#445566')
 assert.equal(prepareComponent(changed).html,changed.html)
})
test('六种图表输出实际PNG，缺失点不跨线，零总量保持待补状态',async()=>{
 for(const type of chartTypes){const c:ResolvedChart={type,labels:['甲','乙','丙'],series:[{name:'示例',values:[25,50,25]}],colors:['#ff0000','#00ff00','#0000ff'],unit:'人'};const buffer=await renderChart(c),m=await sharp(buffer).metadata();assert.equal(m.format,'png');assert.equal(m.width,750);assert.equal(m.height,496);assert.ok(buffer.length>2000,type)}
 const base:ResolvedChart={type:'line',labels:['一','二','三'],series:[{name:'示例',values:[1,null,3]}],colors:['#ff0000'],unit:''}
 const svg=chartSvg(base);assert.ok(!/NaN|Infinity/.test(svg));assert.ok(!svg.includes('L200'))
 assert.ok(chartSvg({...base,type:'pie',series:[{name:'示例',values:[0,0,0]}]}).includes('请补全有效数据'))
 assert.ok(chartSvg({...base,type:'pie',series:[{name:'示例',values:[1,1,1]}]}).includes('33.4%'))
})
test('图表接口返回PNG，导出自包含图片并保留原始数据文字',async()=>{
 const root=resolve(import.meta.dirname,'..'),dataDir=mkdtempSync(join(tmpdir(),'qinbian-chart-')),c=await createApp({root,seedDir:join(root,'seed'),dataDir,apiKey:''})
 try{
  const d=data(),src=d.html.match(/src="([^"]+)"/)![1]!
  const response=await c.app.inject(src);assert.equal(response.statusCode,200);assert.equal(response.headers['content-type'],'image/png')
  assert.equal((await c.app.inject('/api/charts/render?spec=bad')).statusCode,400)
  const output=(await c.app.inject({method:'POST',url:'/api/export',payload:{html:d.html}})).json().html
  assert.match(output,/data:image\/png;base64,/);assert.ok(!output.includes('/api/charts/'));assert.ok(!output.includes('data-qb-chart'));assert.match(output,/甲类/);assert.ok(output.replace(/<[^>]*>/g,'').replace(/\s+/g,'').includes('甲类25人'))
 }finally{await c.app.close();rmSync(dataDir,{recursive:true,force:true})}
})
test('分隔符生成四种可编辑样式，内联边线和留白可导出',()=>{
 for(const s of dividerStyles){const c=prepareComponent({...makeDivider(s.id),palette:defaultPalette});assert.ok(!sanitizeHtml(c.html,true).includes('{{'));assert.ok(c.fields.some(f=>f.id==='space'));const changed=prepareComponent({...c,values:{...c.values,space:32,lineWidth:48,title:'真正的标题'}});assert.match(changed.html,/margin:32px 0/);if(s.id==='hairline'||s.id==='double'){assert.match(changed.html,/border-top:1px solid/);assert.match(changed.html,/width:48%/)}if(s.id==='chapter')assert.match(changed.html,/真正的标题/)}
})
test('插入栏筛选按套组、分类、来源和关键词共同生效，名称使用首字',()=>{
 const items=[{name:'东秦图表',description:'可编辑',category:'数据与清单',tags:['line'],themeSetId:'a',builtin:false,legacyId:null},{name:'内置细线',category:'章节与分隔',tags:['分隔符'],themeSetId:'a',builtin:true,legacyId:'B01'},{name:'其他图表',category:'数据与清单',tags:['pie'],themeSetId:'b',builtin:false,legacyId:null}]
 assert.deepEqual(filterComponents(items,{themeSetId:'a',category:'数据与清单',source:'mine',query:'LINE'}).map(r=>r.name),['东秦图表'])
 assert.equal(filterComponents(items,{themeSetId:'a',source:'builtin'}).length,1);assert.equal(filterComponents(items,{query:'不存在'}).length,0)
 assert.equal(componentInitial(' 东秦图表'),'东');assert.equal(componentInitial('🌿 组件'),'🌿');assert.equal(componentInitial(''),'文')
})
