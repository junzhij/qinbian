import { parseFragment, serializeOuter, serialize } from 'parse5'
export const parseHtml=(html:string):any=>parseFragment(html)
export const serializeHtml=(root:any)=>serialize(root)
export const outerHtml=(node:any)=>serializeOuter(node)
export const attr=(n:any,key:string):string|undefined=>(n?.attrs||[]).find((a:any)=>a.name===key)?.value
export function setAttr(n:any,key:string,value:string){n.attrs=n.attrs||[];const item=n.attrs.find((a:any)=>a.name===key);if(item)item.value=value;else n.attrs.push({name:key,value})}
export function removeAttr(n:any,key:string){n.attrs=(n.attrs||[]).filter((a:any)=>a.name!==key)}
export const elements=(n:any):any[]=>n?.childNodes?.filter((c:any)=>!!c.tagName)||[]
export function nodeAt(root:any,path:number[]){let n=root;for(const i of path){n=elements(n)[i];if(!n)return null}return n}
export function walkHtml(n:any,fn:(node:any,path:number[])=>void,path:number[]=[]){if(n.tagName)fn(n,path);elements(n).forEach((c,i)=>walkHtml(c,fn,[...path,i]))}
export function textOf(n:any):string{if(n.nodeName==='#text')return n.value;if(n.tagName==='br')return '\n';return(n.childNodes||[]).map(textOf).join('')}
export function styleMap(css:string):Record<string,string>{const values:Record<string,string>={};let current='',quote='',depth=0;for(const c of css+';'){if(quote){current+=c;if(c===quote)quote='';continue}if(c==='"'||c==="'"){quote=c;current+=c;continue}if(c==='(')depth++;if(c===')')depth--;if(c===';'&&!depth){const at=current.indexOf(':');if(at>0)values[current.slice(0,at).trim().toLowerCase()]=current.slice(at+1).trim();current=''}else current+=c}return values}
export function writeStyles(n:any,styles:Record<string,string>){const css=Object.entries(styles).filter(([,v])=>v!=='').map(([k,v])=>`${k}:${v};`).join('');if(css)setAttr(n,'style',css);else removeAttr(n,'style')}
export function fingerprint(html:string){let a=2166136261,b=5381;for(let i=0;i<html.length;i++){a=Math.imul(a^html.charCodeAt(i),16777619);b=Math.imul(b,33)^html.charCodeAt(i)}return html.length.toString(36)+'-'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16)}
