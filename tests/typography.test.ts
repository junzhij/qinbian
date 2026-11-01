import { test } from 'node:test'
import assert from 'node:assert/strict'
import { articleHtml, sanitizeHtml, wechatHtml, wechatFontStack, rules } from '../packages/shared/src/index.ts'
test('默认正文不覆盖公众号字体，显式指定的设备字体仍保留',()=>{
 const source=articleHtml([{id:'a',name:'默认字体',html:'<section><p style="font-family:inherit;font-size:18px;"><span leaf="">跟随公众号</span></p></section>',assetIds:[]}])
 const output=wechatHtml(sanitizeHtml(source,true))
 assert.ok(!output.includes('font-family:'));assert.match(output,/font-size:18px/);assert.equal(rules.typography.heading,'inherit');assert.match(wechatFontStack,/mp-quote/)
 const explicit=wechatHtml(sanitizeHtml('<p style="font-family:Songti SC,STSong,SimSun,serif;"><span leaf="">原有宋体保留</span></p>',true))
 assert.match(explicit,/font-family:Songti SC,STSong,SimSun,serif/);assert.ok(!explicit.includes('QinSerif'))
})
