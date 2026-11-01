import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTextStyles, prepareArticleComponent, prepareComponent, elementInfo, patchElement, articleHtml, sanitizeHtml, defaultPalette } from '../packages/shared/src/index.ts'
import { parseHtml, nodeAt, attr, styleMap, textOf } from '../packages/shared/src/html-tree.ts'
const html='<section style="padding:20px;border-left:3px solid #123456;border-radius:8px;"><p style="font-size:24px;margin:7px 0;color:#224466;"><span leaf="">文章标题</span></p><p data-qb-field="body" style="font-size:18px;line-height:1.7;margin:5px 0;"><span style="font-size:13px;">正文占位，用来承载后续的长文。</span><strong>重点保留</strong><span data-qb-custom-properties="font-size" style="font-size:20px;">单独字号</span></p><p style="font-size:12px;text-align:right;">摄影：同学</p><p style="font-size:24px;">98%</p></section>'
const css=(html:string,path:number[])=>styleMap(attr(nodeAt(parseHtml(html),path),'style')||'')
test('全文样式按角色应用，保留边框、颜色、强调和局部字号',()=>{
 const profile=normalizeTextStyles(),c=prepareArticleComponent({html},profile)
 assert.equal(css(c.html,[0,0])['font-size'],'22px');assert.equal(css(c.html,[0,1])['font-size'],'15px');assert.equal(css(c.html,[0,1])['text-align'],'justify');assert.equal(css(c.html,[0,1])['text-indent'],'2em')
 assert.equal(css(c.html,[0,1,0])['font-size'],undefined);assert.equal(css(c.html,[0,1,2])['font-size'],'20px');assert.equal(nodeAt(parseHtml(c.html),[0,1,1]).tagName,'strong');assert.equal(textOf(nodeAt(parseHtml(c.html),[0,1,1])),'重点保留')
 assert.equal(css(c.html,[0,2])['font-size'],'12px');assert.equal(css(c.html,[0,3])['font-size'],'24px');assert.equal(css(c.html,[0])['border-left'],'3px solid #123456');assert.equal(css(c.html,[0,0]).color,'#224466')
 const out=sanitizeHtml(articleHtml([{...c,id:'b',name:'卡片',assetIds:[]}],{backgroundColor:'#EEF3EB',textStyles:profile}),true);assert.ok(!out.includes('data-qb-'));assert.ok(out.includes('text-align:justify'))
})
test('修改全文规则不会累加覆盖，停用会还原原排版',()=>{
 const p=normalizeTextStyles(),a=prepareArticleComponent({html},p),next=normalizeTextStyles(p);next.roles.body.fontSize=16;next.roles.body.after=18
 const b=prepareArticleComponent(a,next);assert.equal(css(b.html,[0,1])['font-size'],'16px');assert.equal(css(b.html,[0,1])['margin-bottom'],'18px');assert.equal(prepareArticleComponent(b,next).html,b.html)
 const restored=prepareArticleComponent(b,undefined);assert.equal(css(restored.html,[0,1])['font-size'],'18px');assert.equal(css(restored.html,[0,1])['line-height'],'1.7');assert.equal(css(restored.html,[0,1,0])['font-size'],'13px');assert.ok(!restored.html.includes('data-qb-typography'))
})
test('点选的局部文字设置优先于全文规则，独立区域保持原样',()=>{
 const p=normalizeTextStyles(),a=prepareArticleComponent({html},p),selected=elementInfo(a.html,[0,1])!
 const changed=patchElement(a.html,selected,{styles:{'font-size':'21px'}}),next=normalizeTextStyles(p);next.roles.body.fontSize=17
 const b=prepareArticleComponent({...a,html:changed},next);assert.equal(css(b.html,[0,1])['font-size'],'21px')
 const independent=patchElement(b.html,elementInfo(b.html,[0,0])!,{independent:true}),last=normalizeTextStyles(next);last.roles.heading.fontSize=16
 const c=prepareArticleComponent({...b,html:independent},last);assert.equal(css(c.html,[0,0])['font-size'],'22px')
 const follow=patchElement(c.html,elementInfo(c.html,[0,1])!,{resetOverrides:true});assert.equal(css(prepareArticleComponent({...c,html:follow},next).html,[0,1])['font-size'],'17px')
 const mapped=patchElement(b.html,elementInfo(b.html,[0,1])!,{styles:{color:'#123456'},bindings:{color:'color2-highlight'}}),palette=structuredClone(defaultPalette);palette.colors[1]!.highlight='#123456'
 const colored=normalizeTextStyles(next);colored.roles.body.color='#FFFFFF'
 const d=prepareArticleComponent({...b,html:mapped,palette},colored);assert.equal(css(d.html,[0,1]).color,'#123456')
 palette.colors[1]!.highlight='#654321';assert.equal(css(prepareArticleComponent({...d,palette},colored).html,[0,1]).color,'#654321')
 assert.throws(()=>patchElement(d.html,elementInfo(d.html,[0,1])!,{bindings:{color:'unsafe'}}),/映射/)
})
test('全文文字颜色以最新配色为还原基线，旧稿默认不改变',()=>{
 const source=prepareComponent({html:'<section><p data-qb-role="body" style="color:{{color1-regular}};">正文</p></section>',palette:defaultPalette}),p=normalizeTextStyles();p.roles.body.color='#334455'
 const a=prepareArticleComponent(source,p),palette=structuredClone(defaultPalette);palette.colors[0]!.regular='#AB3456'
 const b=prepareArticleComponent({...a,palette},p),c=prepareArticleComponent(b,undefined);assert.equal(css(b.html,[0,0]).color,'#334455');assert.equal(css(c.html,[0,0]).color,'#AB3456')
 const untouched=prepareArticleComponent({html},undefined);assert.equal(css(untouched.html,[0,1])['font-size'],'18px');assert.ok(!untouched.html.includes('data-qb-typography'))
})
