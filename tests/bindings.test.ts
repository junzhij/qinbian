import {test} from 'node:test'
import assert from 'node:assert/strict'
import { defaultPalette, paletteSchema, makeColor, prepareComponent, extractFieldValues, usedColorTokens, sanitizeHtml, resolveColor, legacyTokens } from '../packages/shared/src/index.ts'
const palette={name:'三色演示',colors:defaultPalette.colors.slice(0,3)}
test('配色限制3—6色，中文名字可改而代号不变',()=>{
 assert.equal(paletteSchema.safeParse(palette).success,true)
 assert.equal(paletteSchema.safeParse({...palette,colors:palette.colors.slice(0,2)}).success,false)
 const changed=structuredClone(palette);changed.colors[0]!.name='深海的蓝';assert.equal(changed.colors[0]!.id,'color1');assert.equal(legacyTokens(changed)['深海的蓝'],palette.colors[0]!.regular)
 assert.equal(resolveColor('color1-regular',changed),palette.colors[0]!.regular)
})
test('颜色占位符编译为内联样式，同时保留可编辑映射',()=>{
 const c=prepareComponent({html:'<section style="background-color:{{color2-light}};border-left:3px solid {{color3-highlight}};"><p style="color:{{color1-regular}};"><span leaf="">正文</span></p></section>',palette})
 assert.ok(c.html.includes('data-qb-styles'))
 assert.ok(c.html.includes(palette.colors[0]!.regular));assert.ok(c.html.includes(palette.colors[1]!.light))
 assert.deepEqual(usedColorTokens(c.html),['color1-regular','color2-light','color3-highlight'])
 const changed=prepareComponent({...c,colorMappings:{'color1-regular':'color3-highlight'}})
 assert.ok(changed.html.includes('color:'+palette.colors[2]!.highlight))
 const custom=prepareComponent({...changed,colorMappings:{'color1-regular':'#123456'}});assert.ok(custom.html.includes('color:#123456'))
 const exported=sanitizeHtml(custom.html,true);assert.ok(!exported.includes('data-qb-'));assert.ok(!exported.includes('{{'));assert.ok(exported.includes('color:#123456'))
})
test('文案、数字、百分比可通过字段设置修改，配色改变不抹掉文字强调',()=>{
 const c=prepareComponent({palette,fields:[{id:'title',label:'标题',type:'text',default:'活动说明',suffix:''},{id:'current',label:'当前值',type:'number',default:25,suffix:''},{id:'total',label:'总量',type:'number',default:40,suffix:''},{id:'percent',label:'进度',type:'computed',default:0,suffix:'',formula:{op:'percent',numerator:'current',denominator:'total'}}],html:'<div style="color:{{color1-regular}}"><span leaf="" data-qb-field="title">{{title}}</span></div><p><span leaf="" data-qb-field="percent">{{percent}}</span>％</p><section style="height:6px;width:{{percent}}%;background-color:{{color2-regular}};"></section>'})
 assert.ok(c.html.includes('活动说明'));assert.ok(c.html.includes('62.5'));assert.ok(c.html.includes('width:62.5%'))
 const changed=prepareComponent({...c,values:{...c.values,title:'新的标题',current:10}})
 assert.ok(changed.html.includes('新的标题'));assert.ok(changed.html.includes('width:25%'))
 const rich=changed.html.replace('新的标题','<strong>新的标题</strong>')
 const next=prepareComponent({...changed,html:rich,values:{...changed.values,...extractFieldValues(rich,changed.fields)},colorMappings:{'color1-regular':'color2-highlight'}})
 assert.ok(next.html.includes('<strong>新的标题</strong>'))
})
test('自定义颜色不重新吸附主题映射，未知字段内容仍保持可见',()=>{
 const c=prepareComponent({palette,html:`<p data-qb-custom-color="true" style="color:${palette.colors[0]!.regular};"><span leaf="">自定义</span></p><p>{{note}}</p>`})
 assert.equal(usedColorTokens(c.html).length,0);assert.ok(c.fields.some(f=>f.id==='note'));assert.ok(!c.html.includes('{{note}}'))
})
test('旧的div文本框占位自动成为可修改字段',()=>{
 const c=prepareComponent({palette,html:'<section><div style="padding:12px;background-color:#ffffff;color:#183A49;"><span leaf="">文本框内容占位</span></div></section>'})
 assert.equal(c.fields.length,1);assert.equal(c.fields[0]!.label,'文本框内容')
 const updated=prepareComponent({...c,values:{[c.fields[0]!.id]:'现在可以编辑'}})
 assert.ok(updated.html.includes('现在可以编辑'));assert.ok(updated.html.includes('padding:12px'));assert.ok(updated.html.includes('background-color:#ffffff'))
})
