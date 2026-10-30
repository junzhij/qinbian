<script setup lang="ts">
import { Editor, Mark, Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { sanitizeHtml, cleanStyle } from '@qinbian/shared'
import { imageElements } from '~/utils/image-slots'
import { elementPath, elementAtPath, paragraphContent, mountParagraphHost, composeParagraph, editableTextElement } from '~/utils/paragraph-session'

const props=defineProps<{html:string;selected?:boolean;readonly?:boolean}>()
const emit=defineEmits<{update:[html:string];select:[];editor:[editor:Editor|null];media:[index:number];field:[id:string]}>()
const island=ref<HTMLElement>()
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
  fontSize:{default:null,parseHTML:el=>el.style.fontSize||null,renderHTML:attrs=>attrs.fontSize?{style:`font-size:${attrs.fontSize}`}:{}} ,
  fontFamily:{default:null,parseHTML:el=>el.style.fontFamily||null,renderHTML:attrs=>attrs.fontFamily?{style:`font-family:${attrs.fontFamily}`}:{}} ,
  colorToken:{default:null,parseHTML:el=>{try{return JSON.parse(el.getAttribute('data-qb-styles')||'{}').color?.match(/\{\{(color[1-6]-(?:regular|highlight|light))\}\}/)?.[1]||null}catch{return null}},renderHTML:attrs=>attrs.colorToken?{'data-qb-styles':JSON.stringify({color:`{{${attrs.colorToken}}}`})}:{}},
  customColor:{default:false,parseHTML:el=>el.getAttribute('data-qb-custom-color')==='true',renderHTML:attrs=>attrs.customColor?{'data-qb-custom-color':'true'}:{}},
 }}]},
})
function render(){if(island.value)island.value.innerHTML=working}
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
 if(editor?.view.dom.contains(target))return
 if(target.closest('[data-qb-chart]')){emit('field',target.closest<HTMLElement>('[data-qb-field]')?.dataset.qbField||'');return}
 const img=target.closest('img'),placeholder=target.closest<HTMLElement>('[data-qb-field-type="image"],section')
 const slots=imageElements(island.value)
 if(img||placeholder&&slots.includes(placeholder)){const index=Math.max(0,slots.indexOf(img||placeholder!));stop();emit('media',index);return}
 const paragraph=editableTextElement(island.value,target)
 if(paragraph&&island.value.contains(paragraph))editParagraph(paragraph)
}
onMounted(render)
watch(()=>props.html,value=>{
 if(value===lastEmitted)return
 clearTimeout(blurTimer)
 if(editor){editor.destroy();editor=null;emit('editor',null)}
 working=sanitizeHtml(value);lastEmitted=value;changed=false;render()
})
watch(()=>props.selected,selected=>{if(!selected&&editor)stop()})
onBeforeUnmount(()=>{clearTimeout(blurTimer);editor?.destroy()})
defineExpose({flush:()=>{publish(compose().html);return working},blur:stop})
</script>
<template><div ref="island" class="canvas-island" :class="{selected,readonly}" @click="clicked" @keydown.stop/></template>
