import { z } from 'zod'
import { parseHtml, serializeHtml, outerHtml, elements, attr, setAttr, removeAttr, nodeAt, textOf, styleMap, writeStyles, fingerprint, walkHtml } from './html-tree.ts'
import { roleSchema, inferTextRole, freezeTextNode, cleanTextBackup, typographyProperties } from './text-styles.ts'
export const elementSelectionSchema=z.object({path:z.array(z.number().int().min(0).max(10000)).min(1).max(32),fingerprint:z.string().min(1).max(100)})
export type ElementSelection=z.infer<typeof elementSelectionSchema>
export const elementLocksSchema=z.object({text:z.boolean().default(true),images:z.boolean().default(true),data:z.boolean().default(true)})
export type ElementLocks=z.infer<typeof elementLocksSchema>
export function elementInfo(html:string,path:number[]){
 const root=parseHtml(html),node=nodeAt(root,path);if(!node)return null
 const value=outerHtml(node),parents=[]
 for(let i=1;i<=path.length;i++){const at=path.slice(0,i),n=nodeAt(root,at);if(n)parents.push({path:at,tag:n.tagName,role:inferTextRole(n),label:attr(n,'data-qb-field')||n.tagName,field:attr(n,'data-qb-field')||'',chart:!!attr(n,'data-qb-chart')})}
 return{path:[...path],fingerprint:fingerprint(value),html:value,tag:node.tagName,text:textOf(node),styles:styleMap(attr(node,'style')||''),role:inferTextRole(node),independent:attr(node,'data-qb-style-mode')==='independent',customProperties:(attr(node,'data-qb-custom-properties')||'').split(',').filter(Boolean),field:attr(node,'data-qb-field')||'',chart:!!attr(node,'data-qb-chart'),parents,children:elements(node).map((n,i)=>({path:[...path,i],tag:n.tagName,label:attr(n,'data-qb-field')||textOf(n).trim().slice(0,22)||n.tagName}))}
}
export type ElementInfo=NonNullable<ReturnType<typeof elementInfo>>
export function requireElement(html:string,selection:ElementSelection){const value=elementInfo(html,selection.path);if(!value||value.fingerprint!==selection.fingerprint)throw new Error('选中元素已改变，请重新点选；候选仍可保留');return value}
export const elementStyleProperties=['font-size','font-family','font-weight','font-style','line-height','letter-spacing','text-align','text-indent','color','background-color','width','height','margin-top','margin-bottom','margin-left','margin-right','padding-top','padding-bottom','padding-left','padding-right','border-color','border-width','border-style','border-radius'] as const
export type ElementStyleProperty=typeof elementStyleProperties[number]
export function validElementStyle(key:string,value:string){
 if(!value)return true
 if(!elementStyleProperties.includes(key as ElementStyleProperty)||value.length>512||/[;<>\\{}]/.test(value)||/url\s*\(|expression|javascript|var\s*\(/i.test(value))return false
 if(key==='color'||key==='background-color'||key==='border-color')return /^(#[\da-fA-F]{6}|transparent|rgba?\([\d., %]+\))$/.test(value)
 if(key==='font-family')return /^[\p{L}\p{N}\s,'"._-]+$/u.test(value)
 if(key==='text-align')return ['left','center','right','justify'].includes(value)
 if(key==='font-style')return ['normal','italic'].includes(value)
 if(key==='font-weight')return /^(400|500|600|700|normal|bold)$/.test(value)
 if(key==='border-style')return /^(none|solid|dashed|dotted|double)$/.test(value)
 if(key==='line-height')return /^\d*(?:\.\d+)?$/.test(value)&&Number(value)>=0&&Number(value)<=3
 const m=value.match(/^(-?\d+(?:\.\d+)?)(px|em|%)$/);if(!m)return ['auto','inherit'].includes(value)&&['width','height'].includes(key)
 const n=Number(m[1]),unit=m[2]
 if(key==='font-size')return unit==='px'&&n>=10&&n<=24
 if(key==='text-indent')return unit==='em'&&n>=0&&n<=4
 if(key==='letter-spacing')return unit==='px'&&n>=-1&&n<=6
 if(key==='width')return unit==='%'?n>0&&n<=100:unit==='px'&&n>=0&&n<=680
 if(key==='height')return unit==='px'&&n>=0&&n<=1600
 return unit==='px'&&n>=(key.startsWith('margin')?-48:0)&&n<=120
}
function detach(n:any,keys:string[]){
 const custom=new Set((attr(n,'data-qb-custom-properties')||'').split(',').filter(Boolean)),backup=cleanTextBackup(attr(n,'data-qb-typography')||'')
 let bindings:Record<string,string>={};try{bindings=JSON.parse(attr(n,'data-qb-styles')||'{}')}catch{}
 for(const key of keys){custom.add(key);delete backup[key];delete bindings[key];if(key==='border-color')for(const side of ['top','right','bottom','left']){custom.add('border-'+side);custom.add('border-'+side+'-color');delete bindings['border-'+side];delete bindings['border-'+side+'-color']}}
 setAttr(n,'data-qb-custom-properties',[...custom].join(','));if(Object.keys(backup).length)setAttr(n,'data-qb-typography',JSON.stringify(backup));else removeAttr(n,'data-qb-typography');if(Object.keys(bindings).length)setAttr(n,'data-qb-styles',JSON.stringify(bindings));else removeAttr(n,'data-qb-styles')
}
export function patchElement(html:string,selection:ElementSelection,patch:{styles?:Partial<Record<ElementStyleProperty,string>>;bindings?:Partial<Record<ElementStyleProperty,string>>;role?:z.infer<typeof roleSchema>;independent?:boolean;resetOverrides?:boolean}){
 requireElement(html,selection);const root=parseHtml(html),node=nodeAt(root,selection.path)!,css=styleMap(attr(node,'style')||'')
 for(const[k,v]of Object.entries(patch.styles||{})){if(!validElementStyle(k,v!))throw new Error('属性值不适合正文：'+k);if(k==='height'&&parseFloat(v!)===0&&textOf(node).trim())throw new Error('文字区域请使用自动高度，避免移动端内容消失');if(k==='line-height'&&Number(v)===0&&textOf(node).trim())throw new Error('有文字的元素不能使用零行高');if(v)css[k]=v;else delete css[k]}
 if(patch.styles){detach(node,Object.keys(patch.styles));writeStyles(node,css)}
 if(patch.bindings){
  let bindings:Record<string,string>={};try{bindings=JSON.parse(attr(node,'data-qb-styles')||'{}')}catch{}
  const custom=new Set((attr(node,'data-qb-custom-properties')||'').split(',').filter(Boolean)),local=new Set((attr(node,'data-qb-text-overrides')||'').split(',').filter(Boolean))
  for(const[key,token]of Object.entries(patch.bindings)){
   if(!['color','background-color','border-color'].includes(key)||!/^color[1-6]-(regular|highlight|light)$/.test(token||''))throw new Error('无效的主题颜色映射')
   bindings[key]='{{'+token+'}}';custom.delete(key);if(key==='color'){local.add(key);removeAttr(node,'data-qb-custom-color')}
  }
  setAttr(node,'data-qb-styles',JSON.stringify(bindings));if(custom.size)setAttr(node,'data-qb-custom-properties',[...custom].join(','));else removeAttr(node,'data-qb-custom-properties');if(local.size)setAttr(node,'data-qb-text-overrides',[...local].join(','))
 }
 if(patch.role!==undefined)setAttr(node,'data-qb-role',roleSchema.parse(patch.role))
 if(patch.independent===true){freezeTextNode(node);setAttr(node,'data-qb-style-mode','independent')}
 if(patch.independent===false)removeAttr(node,'data-qb-style-mode')
 if(patch.resetOverrides){walkHtml(node,n=>{removeAttr(n,'data-qb-style-mode');const custom=(attr(n,'data-qb-custom-properties')||'').split(',').filter(k=>!typographyProperties.includes(k as any));if(custom.length)setAttr(n,'data-qb-custom-properties',custom.join(','));else removeAttr(n,'data-qb-custom-properties');removeAttr(n,'data-qb-custom-color');removeAttr(n,'data-qb-text-overrides')})}
 return serializeHtml(root)
}
export function fieldIdsIn(html:string){const ids=new Set<string>(),root=parseHtml(html);walkHtml(root,n=>{const field=attr(n,'data-qb-field');if(field)ids.add(field);for(const name of ['data-qb-chart','data-qb-styles'])for(const m of (attr(n,name)||'').matchAll(/\{\{([a-zA-Z][\w.-]{0,63})\}\}/g))if(!/^color[1-6]-/.test(m[1]!))ids.add(m[1]!)});return ids}
function visibleText(n:any):string{if(n.nodeName==='#text')return n.value;if(n.tagName==='br')return ' ';const value=(n.childNodes||[]).map(visibleText).join('');return['p','h2','h3','h4','td','th','li'].includes(n.tagName)?' '+value+' ':value}
function textSignature(root:any,ignoreNumbers=false){const text=ignoreNumbers?visibleText(root).replace(/[+-]?\d+(?:[.,]\d+)*(?:[%％])?/g,'#number#'):visibleText(root);return(text.match(/[A-Za-z0-9]+|[\u3400-\u9fff]|[^\s]/gu)||[]).join('\u0000')}
function imageSignature(root:any){const images:string[]=[];const visit=(n:any)=>{if(attr(n,'data-qb-chart'))return;if(n.tagName==='img')images.push((attr(n,'src')||'')+'\u0000'+(attr(n,'alt')||''));for(const c of elements(n))visit(c)};visit(root);return images}
function dataSignature(root:any){const data:any[]=[visibleText(root).match(/[+-]?\d+(?:[.,]\d+)*(?:[%％])?/g)||[]];walkHtml(root,n=>{const chart=attr(n,'data-qb-chart');if(chart){const spec=JSON.parse(chart);data.push({labels:spec.labels,series:spec.series,unit:spec.unit})}for(const key of ['data-ratio-value','data-ratio-total','data-ratio-unit'])if(attr(n,key)!==undefined)data.push([key,attr(n,key)])});return data}
export function replaceElement(html:string,selection:ElementSelection,replacement:string,locks:ElementLocks={text:true,images:true,data:true}){
 const original=requireElement(html,selection),root=parseHtml(html),old=nodeAt(root,selection.path)!,fragment=parseHtml(replacement),list=elements(fragment)
 if(list.length!==1||(fragment.childNodes||[]).some((n:any)=>n.nodeName==='#text'&&n.value.trim()))throw new Error('局部候选必须只包含一个完整元素')
 const next=list[0]!
 if(next.tagName!==old.tagName)throw new Error('局部修改需保留选中元素的标签与边界')
 for(const key of ['data-qb-field','data-qb-field-type','data-qb-role','data-qb-style-mode','data-qb-typography','data-qb-styles'])if(attr(old,key)!==undefined&&attr(next,key)===undefined)setAttr(next,key,attr(old,key)!)
 const oldFields=fieldIdsIn(original.html),newFields=fieldIdsIn(outerHtml(next));if([...oldFields].some(id=>!newFields.has(id)))throw new Error('局部修改不能移除已有的可编辑字段标记')
 if(locks.text&&textSignature(old,!locks.data)!==textSignature(next,!locks.data))throw new Error('候选改变了锁定的文字，请保持原文')
 if(locks.images&&JSON.stringify(imageSignature(old))!==JSON.stringify(imageSignature(next)))throw new Error('候选改变了锁定的图片或图片说明')
 if(locks.data&&JSON.stringify(dataSignature(old))!==JSON.stringify(dataSignature(next)))throw new Error('候选改变了锁定的图表或比例数据')
 let structureChanged=false
 const mark=(a:any,b:any)=>{if(a.tagName!==b.tagName||elements(a).length!==elements(b).length){structureChanged=true;return}const oldCss=styleMap(attr(a,'style')||''),css=styleMap(attr(b,'style')||'');const keys=typographyProperties.filter(k=>oldCss[k]!==css[k]);if(keys.length){let binding:Record<string,string>={};try{binding=JSON.parse(attr(b,'data-qb-styles')||'{}')}catch{}const mapped=keys.filter(k=>k==='color'&&binding.color);const fixed=keys.filter(k=>!mapped.includes(k));if(fixed.length)detach(b,fixed);if(mapped.length){const local=new Set((attr(b,'data-qb-text-overrides')||'').split(',').filter(Boolean));mapped.forEach(k=>local.add(k));setAttr(b,'data-qb-text-overrides',[...local].join(','));const backup=cleanTextBackup(attr(b,'data-qb-typography')||'');mapped.forEach(k=>delete backup[k]);if(Object.keys(backup).length)setAttr(b,'data-qb-typography',JSON.stringify(backup));else removeAttr(b,'data-qb-typography')}}if(attr(a,'data-qb-typography')&&!attr(b,'data-qb-typography')){const backup=cleanTextBackup(attr(a,'data-qb-typography')!);keys.forEach(k=>delete backup[k]);if(Object.keys(backup).length)setAttr(b,'data-qb-typography',JSON.stringify(backup))}elements(a).forEach((n,i)=>mark(n,elements(b)[i]))}
 mark(old,next);if(structureChanged){freezeTextNode(next);setAttr(next,'data-qb-style-mode','independent')}
 const parent=old.parentNode,index=parent.childNodes.indexOf(old);parent.childNodes[index]=next;next.parentNode=parent
 return serializeHtml(root)
}
