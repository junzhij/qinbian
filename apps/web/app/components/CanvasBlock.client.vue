<script setup lang="ts">
import { Editor, Mark, Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { elementInfo, wechatFontStack, sanitizeHtml, cleanStyle } from '@qinbian/shared'
import { imageElements } from '~/utils/image-slots'
import { elementPath, elementAtPath, paragraphContent, mountParagraphHost, composeParagraph, editableTextElement } from '~/utils/paragraph-session'

const props=defineProps<{html:string;selected?:boolean;readonly?:boolean;inspect?:boolean;inspectedPath?:number[]}>()
const emit=defineEmits<{update:[html:string];select:[];editor:[editor:Editor|null];media:[index:number];field:[id:string];inspect:[path:number[],computed:Record<string,string>,activate:boolean];inspectExit:[]}>()
const island=ref<HTMLElement>(),wrapper=ref<HTMLElement>(),hoverPath=ref<number[]|null>(null),ring=ref<{left:number;top:number;width:number;height:number;label:string}|null>(null)
let measureObserver:ResizeObserver|undefined
function measureRing(){const path=hoverPath.value||props.inspectedPath;if(!props.inspect||!path||!island.value||!wrapper.value){ring.value=null;return}const target=elementAtPath(island.value,path);if(!target){ring.value=null;return}const box=target.getBoundingClientRect(),outer=wrapper.value.getBoundingClientRect();ring.value={left:box.left-outer.left,top:box.top-outer.top,width:box.width,height:box.height,label:target.tagName.toLowerCase()}}
function hover(event:MouseEvent){if(!props.inspect||!island.value)return;const target=inspectionTarget(event.target as HTMLElement);hoverPath.value=target?elementPath(island.value,target):null;measureRing()}
function inspectionTarget(target:HTMLElement){if(!island.value?.contains(target)||target===island.value)return null;const chart=target.closest<HTMLElement>('[data-qb-chart]');if(chart)return chart;const logical=target.closest<HTMLElement>('img,p,h2,h3,h4,figcaption,li,td,th,[data-qb-field-type="image"]');return logical&&island.value.contains(logical)?logical:target}
function selectElement(path:number[],activate=true){if(!island.value)return;const target=elementAtPath(island.value,path);if(!target)return;const computed=getComputedStyle(target),values:Record<string,string>={};for(const k of ['font-size','font-family','font-weight','font-style','line-height','letter-spacing','text-align','text-indent','color','background-color','width','height','margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left','border-width','border-radius','border-color'])values[k]=computed.getPropertyValue(k);emit('inspect',path,values,activate);void nextTick(measureRing)}

let editor:Editor|null=null,lastEmitted=props.html,working=sanitizeHtml(props.html),activeBase='',activePath:number[]=[],changed=false
let blurTimer:ReturnType<typeof setTimeout>|undefined
const PreserveSpan=Mark.create({
 name:'preserveSpan',priority:101,
 addAttributes(){return{style:{default:null},field:{default:null,parseHTML:el=>el.getAttribute('data-qb-field'),renderHTML:a=>a.field?{'data-qb-field':a.field}:{}},fieldType:{default:null,parseHTML:el=>el.getAttribute('data-qb-field-type'),renderHTML:a=>a.fieldType?{'data-qb-field-type':a.fieldType}:{}},bindings:{default:null,parseHTML:el=>el.getAttribute('data-qb-styles'),renderHTML:a=>a.bindings?{'data-qb-styles':a.bindings}:{}},customColor:{default:false,parseHTML:el=>el.getAttribute('data-qb-custom-color')==='true',renderHTML:a=>a.customColor?{'data-qb-custom-color':'true'}:{}}}},
 parseHTML(){const getAttrs=(node:Node)=>{
  const styles:string[]=[];let element:HTMLElement|null=node as HTMLElement
  while(element?.tagName==='SPAN'){if(element.getAttribute('style'))styles.unshift(element.getAttribute('style')!);element=element.parentElement}
  return {style:cleanStyle(styles.join(';'))}
 };return['span[style]','span[data-qb-field]','span[data-qb-styles]'].map(tag=>({tag,getAttrs}))},
 renderHTML({HTMLAttributes}){return['span',HTMLAttributes,0]},
})
const Typography=Extension.create({
 name:'qinbianTypography',
 addGlobalAttributes(){return[{types:['textStyle'],attributes:{
  localStyles:{default:null,parseHTML:el=>el.getAttribute('data-qb-custom-properties'),renderHTML:a=>a.localStyles?{'data-qb-custom-properties':a.localStyles}:{}},
  fontSize:{default:null,parseHTML:el=>el.style.fontSize||null,renderHTML:attrs=>attrs.fontSize?{style:`font-size:${attrs.fontSize}`}:{}} ,
  fontFamily:{default:null,parseHTML:el=>el.style.fontFamily||null,renderHTML:attrs=>attrs.fontFamily?{style:`font-family:${attrs.fontFamily}`}:{}} ,
  colorToken:{default:null,parseHTML:el=>{try{return JSON.parse(el.getAttribute('data-qb-styles')||'{}').color?.match(/\{\{(color[1-6]-(?:regular|highlight|light))\}\}/)?.[1]||null}catch{return null}},renderHTML:attrs=>attrs.colorToken?{'data-qb-styles':JSON.stringify({color:`{{${attrs.colorToken}}}`})}:{}},
  customColor:{default:false,parseHTML:el=>el.getAttribute('data-qb-custom-color')==='true',renderHTML:attrs=>attrs.customColor?{'data-qb-custom-color':'true'}:{}},
 }},{types:['paragraph'],attributes:{localStyles:{default:null,parseHTML:el=>el.getAttribute('data-qb-custom-properties'),renderHTML:a=>a.localStyles?{'data-qb-custom-properties':a.localStyles}:{}}}}]},
})
function render(){if(island.value)island.value.innerHTML=working;void nextTick(()=>{measureRing();if(props.inspect&&props.inspectedPath)selectElement(props.inspectedPath,false)})}
function compose(nextPath?:number[]){
 if(!editor)return {html:working,nextPath:nextPath||null}
 return changed?composeParagraph(activeBase,activePath,editor.getHTML(),nextPath):{html:activeBase,nextPath:nextPath||null}
}
function publish(html:string){working=html;if(html!==lastEmitted){lastEmitted=html;emit('update',html)}}
function stop(nextPath?:number[]){
 clearTimeout(blurTimer)
 const result=compose(nextPath)
 if(editor){const previous=editor;editor=null;previous.destroy();emit('editor',null)}
 publish(result.html);changed=false;render()
 return result.nextPath
}
function editParagraph(element:HTMLElement){
 if(props.readonly||!island.value)return
 // Double-clicking or selecting words inside an active editor must not
 // create another session using a detached ProseMirror paragraph.
 if(editor?.view.dom.contains(element))return
 const requestedPath=elementPath(island.value,element)
 if(!requestedPath)return
 if(editor){const path=stop(requestedPath);const next=path?elementAtPath(island.value,path):null;if(!next)return;element=next}
 activeBase=working;activePath=elementPath(island.value,element)!;changed=false
 const content=paragraphContent(element),host=mountParagraphHost(element)
 editor=new Editor({
  element:host,
  extensions:[StarterKit.configure({heading:false,codeBlock:false,blockquote:false,horizontalRule:false,bulletList:false,orderedList:false,listItem:false,link:false,underline:false}),TextStyle,Color,Typography,PreserveSpan,Underline,Link.configure({openOnClick:false,HTMLAttributes:{target:null,rel:null}}),TextAlign.configure({types:['paragraph']})],
  content,
  parseOptions:{preserveWhitespace:'full'},
  editorProps:{attributes:{class:'inline-rich-editor','aria-label':'编辑组件文字'}},
  onUpdate(){changed=true;publish(compose().html);emit('editor',editor)},
  onBlur(){blurTimer=setTimeout(()=>{
   if(!editor||editor.isFocused)return
   const focused=document.activeElement
   if(focused instanceof Element&&focused.closest('.rich-toolbar,.modal-backdrop'))return
   stop()
  },120)},
 })
 editor.commands.focus();emit('editor',editor)
}
function clicked(event:MouseEvent){
 emit('select');const target=event.target as HTMLElement
 if(props.readonly||!island.value)return
 if(props.inspect){event.preventDefault();event.stopPropagation();const selected=inspectionTarget(target);if(selected){const path=elementPath(island.value,selected);if(path)selectElement(path)}return}
 if(editor?.view.dom.contains(target))return
 if(target.closest('[data-qb-chart]')){emit('field',target.closest<HTMLElement>('[data-qb-field]')?.dataset.qbField||'');return}
 const img=target.closest('img'),placeholder=target.closest<HTMLElement>('[data-qb-field-type="image"],section')
 const slots=imageElements(island.value)
 if(img||placeholder&&slots.includes(placeholder)){const index=Math.max(0,slots.indexOf(img||placeholder!));stop();emit('media',index);return}
 const paragraph=editableTextElement(island.value,target)
 if(paragraph&&island.value.contains(paragraph))editParagraph(paragraph)
}
onMounted(()=>{render();measureObserver=new ResizeObserver(measureRing);if(wrapper.value)measureObserver.observe(wrapper.value)})
watch(()=>props.inspect,value=>{if(value&&editor)stop();hoverPath.value=null;void nextTick(measureRing)})
watch(()=>props.inspectedPath,()=>{hoverPath.value=null;void nextTick(measureRing)})
watch(()=>props.html,value=>{
 if(value===lastEmitted)return
 clearTimeout(blurTimer)
 if(editor){editor.destroy();editor=null;emit('editor',null)}
 working=sanitizeHtml(value);lastEmitted=value;changed=false;render()
})
watch(()=>props.selected,selected=>{if(!selected&&editor)stop()})
onBeforeUnmount(()=>{clearTimeout(blurTimer);measureObserver?.disconnect();editor?.destroy()})
defineExpose({inspectAt:selectElement,editAt(path:number[]){if(!island.value)return;const el=elementAtPath(island.value,path);if(el){const paragraph=editableTextElement(island.value,el);if(paragraph)editParagraph(paragraph)}},flush:()=>{publish(compose().html);return working},blur:stop})
</script>
<template><div ref="wrapper" class="canvas-render-wrap"><div ref="island" class="canvas-island" :style="{fontFamily:wechatFontStack}" :class="{selected,readonly,inspecting:inspect}" :tabindex="inspect?0:undefined" @click="clicked" @mousemove="hover" @mouseleave="hoverPath=null;measureRing()" @keydown.stop="event=>{if(inspect&&event.key==='Escape')emit('inspectExit')}"/><div v-if="inspect&&ring" class="inspect-ring" :class="{hovering:!!hoverPath}" :style="{left:ring.left+'px',top:ring.top+'px',width:ring.width+'px',height:ring.height+'px'}"><span>{{ring.label}} · {{Math.round(ring.width)}} × {{Math.round(ring.height)}}</span></div></div></template>
<style scoped>.canvas-render-wrap{position:relative}.canvas-island.inspecting{cursor:crosshair}.canvas-island.inspecting :deep(*){cursor:crosshair!important}.inspect-ring{position:absolute;pointer-events:none;border:1px solid #4f7b65;background:#88b86b0d;z-index:12;box-sizing:border-box}.inspect-ring.hovering{border-style:dashed;border-color:#79916c}.inspect-ring>span{position:absolute;left:0;bottom:100%;max-width:220px;padding:3px 7px;font:9px/1.5 var(--sans);color:#fffdf7;background:#4f7b65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:2px 2px 0 0}</style>
