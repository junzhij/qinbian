import type { FieldDefinition } from './bindings.ts'
export const dividerStyles=[{id:'hairline',name:'一线留白'},{id:'double',name:'双线尺素'},{id:'dots',name:'三点停顿'},{id:'chapter',name:'章节题签'}] as const
export type DividerStyle=typeof dividerStyles[number]['id']
export function makeDivider(style:DividerStyle,title='下一章'){
 const fields:FieldDefinition[]=[{id:'space',label:'上下留白（像素）',type:'number',default:24,min:8,max:64,step:1,suffix:'px'}]
 let body=''
 if(style==='chapter'){
  fields.push({id:'title',label:'章节标题',type:'text',default:title,suffix:''},{id:'number',label:'章节编号',type:'text',default:'01',suffix:''})
  body='<p style="margin:0;padding:2px 0 2px 14px;border-left:2px solid {{color2-regular}};font-size:18px;line-height:1.6;text-indent:0;color:{{color1-regular}};"><span leaf="" data-qb-field="number">{{number}}</span><span leaf="">　／　</span><span leaf="" data-qb-field="title">{{title}}</span></p>'
 }else if(style==='dots')body='<p style="margin:0;text-align:center;text-indent:0;font-size:16px;line-height:1;letter-spacing:8px;color:{{color2-regular}};"><span leaf="">·　·　·</span></p>'
 else{
  fields.push({id:'lineWidth',label:'线条宽度（百分比）',type:'number',default:style==='double'?72:80,min:20,max:100,step:1,suffix:'%'})
  body=`<section style="width:{{lineWidth}}%;max-width:100%;height:0;margin:0 auto;border-top:1px solid {{color2-regular}};font-size:0;line-height:0;"><span leaf=""><br></span></section>${style==='double'?'<section style="width:42%;max-width:100%;height:0;margin:5px auto 0;border-top:1px solid {{color2-light}};font-size:0;line-height:0;"><span leaf=""><br></span></section>':''}`
 }
 return{html:`<section style="box-sizing:border-box;width:100%;margin:{{space}}px 0;padding:0;">${body}</section>`,fields,values:Object.fromEntries(fields.map(f=>[f.id,f.default]))}
}
