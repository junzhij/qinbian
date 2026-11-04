<script setup lang="ts" generic="T extends string | number">
import { useId } from 'vue'
import { ChevronDown, Check } from 'lucide-vue-next'
defineOptions({inheritAttrs:false})
type Option={value:T;label:string;description?:string;disabled?:boolean}
const props=withDefaults(defineProps<{modelValue?:T;options:readonly Option[];disabled?:boolean;placeholder?:string;compact?:boolean;variant?:'default'|'quiet'|'toolbar';menuWidth?:number}>(),{placeholder:'请选择',variant:'default'})
const emit=defineEmits<{'update:modelValue':[value:T];change:[value:T]}>(),attrs=useAttrs(),uid=useId(),root=ref<HTMLElement>(),trigger=ref<HTMLButtonElement>(),popup=ref<HTMLElement>(),open=ref(false),active=ref(-1),ready=ref(false),popupStyle=ref<Record<string,string>>({})
const controlId=computed(()=>String(attrs.id||'qin-select-'+uid)),listId=computed(()=>controlId.value+'-list'),selected=computed(()=>props.options.find(o=>Object.is(o.value,props.modelValue))),label=computed(()=>selected.value?.label||(props.modelValue!==undefined&&props.modelValue!==''?String(props.modelValue):props.placeholder))
let typeBuffer='',typeTimer:ReturnType<typeof setTimeout>|undefined
function enabled(){return props.options.map((o,i)=>o.disabled?-1:i).filter(i=>i>=0)}
function position(){if(!trigger.value||!popup.value)return;const r=trigger.value.getBoundingClientRect(),gap=7,margin=12,width=Math.min(Math.max(r.width,props.menuWidth||180),innerWidth-margin*2),below=innerHeight-r.bottom-gap-margin,above=r.top-gap-margin,up=below<180&&above>below,maxHeight=Math.max(70,Math.min(320,up?above:below));popupStyle.value={width:width+'px',maxHeight:maxHeight+'px',left:Math.max(margin,Math.min(r.left,innerWidth-width-margin))+'px',top:(up?Math.max(margin,r.top-gap-Math.min(popup.value.scrollHeight,maxHeight)):r.bottom+gap)+'px'};ready.value=true}
function scrollActive(){void nextTick(()=>document.getElementById(listId.value+'-'+active.value)?.scrollIntoView({block:'nearest'}))}
function close(focus=false){open.value=false;ready.value=false;if(focus)trigger.value?.focus({preventScroll:true})}
async function show(){if(props.disabled||!props.options.length)return;trigger.value?.focus({preventScroll:true});active.value=props.options.findIndex(o=>Object.is(o.value,props.modelValue)&&!o.disabled);if(active.value<0)active.value=enabled()[0]??-1;open.value=true;ready.value=false;await nextTick();position();await nextTick();position();scrollActive()}
function toggle(){if(open.value)close();else void show()}
function choose(index:number){const option=props.options[index];if(!option||option.disabled)return;emit('update:modelValue',option.value);emit('change',option.value);close(true)}
function step(delta:number){const list=enabled();if(!list.length)return;const at=list.indexOf(active.value);active.value=list[(at+delta+list.length)%list.length]!;scrollActive()}
async function keydown(e:KeyboardEvent){
 if(props.disabled||e.isComposing)return
 if(e.key==='Tab'){close();return}
 if(e.key==='Escape'){if(open.value){e.preventDefault();e.stopPropagation();close(true)}return}
 if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key)){
  e.preventDefault();e.stopPropagation()
  if(!open.value){await show();if(e.key==='End')active.value=enabled().at(-1)??-1;else if(e.key==='Home')active.value=enabled()[0]??-1;scrollActive();return}
  if(e.key==='ArrowDown')step(1);else if(e.key==='ArrowUp')step(-1);else if(e.key==='Home'){active.value=enabled()[0]??-1;scrollActive()}else if(e.key==='End'){active.value=enabled().at(-1)??-1;scrollActive()}else choose(active.value)
  return
 }
 if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();if(!open.value)await show();clearTimeout(typeTimer);typeBuffer+=e.key.toLocaleLowerCase();const at=props.options.findIndex(o=>!o.disabled&&o.label.toLocaleLowerCase().startsWith(typeBuffer));if(at>=0){active.value=at;scrollActive()}typeTimer=setTimeout(()=>typeBuffer='',700)}
}
function outside(e:PointerEvent){if(!root.value?.contains(e.target as Node)&&!popup.value?.contains(e.target as Node))close()}
function reposition(){if(open.value)position()}
watch(()=>props.disabled,v=>{if(v)close()});watch(()=>props.options,()=>{if(open.value){active.value=props.options.findIndex(o=>Object.is(o.value,props.modelValue));void nextTick(position)}})
onMounted(()=>{document.addEventListener('pointerdown',outside);window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true)})
onBeforeUnmount(()=>{clearTimeout(typeTimer);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true)})
defineExpose({focus:()=>trigger.value?.focus()})
</script>
<template><div ref="root" class="ui-select" :class="[attrs.class,{'ui-select--compact':compact,'ui-select--quiet':variant==='quiet','ui-select--toolbar':variant==='toolbar',isOpen:open,isDisabled:disabled}]" :style="attrs.style as any"><button :id="controlId" ref="trigger" class="ui-select-trigger" type="button" role="combobox" :aria-label="attrs['aria-label'] as string|undefined" :aria-labelledby="attrs['aria-labelledby'] as string|undefined" :aria-describedby="attrs['aria-describedby'] as string|undefined" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open?listId:undefined" :aria-activedescendant="open&&active>=0?listId+'-'+active:undefined" :disabled="disabled" :title="label" @click.stop="toggle" @keydown="keydown"><slot name="leading"/><span class="ui-select-value">{{label}}</span><ChevronDown class="ui-select-chevron" :size="13"/></button><Teleport to="body"><div v-if="open" :id="listId" ref="popup" role="listbox" :aria-label="attrs['aria-label'] as string|undefined" class="ui-select-popup" :class="{'isReady':ready}" :style="popupStyle" @keydown="keydown" @mousedown.prevent><div v-for="(option,i) in options" :id="listId+'-'+i" :key="String(option.value)" class="ui-select-option" :class="{selected:Object.is(option.value,modelValue),highlighted:active===i,disabled:option.disabled}" role="option" :aria-label="option.label" :aria-describedby="option.description?listId+'-'+i+'-description':undefined" :aria-selected="Object.is(option.value,modelValue)" :aria-disabled="option.disabled||undefined" @pointermove="!option.disabled&&(active=i)" @click.stop="choose(i)"><span><span class="ui-select-option-label">{{option.label}}</span><small v-if="option.description" :id="listId+'-'+i+'-description'">{{option.description}}</small></span><Check v-if="Object.is(option.value,modelValue)" :size="13"/><i v-else class="ui-select-check-space"/></div></div></Teleport></div></template>
<style>
.ui-select{display:inline-block;width:100%;min-width:0;vertical-align:middle}
.ui-select-trigger{display:flex!important;justify-content:space-between!important;align-items:center;gap:10px;width:100%;min-width:0;min-height:36px;padding:0 10px 0 11px!important;border:1px solid var(--line-strong)!important;border-radius:var(--r-s,6px);background:var(--surface,#fff)!important;color:var(--text);font:14px/1.4 var(--sans)!important;text-align:left;cursor:pointer;transition:border-color .12s,box-shadow .12s,background .12s}
.ui-select-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.ui-select-chevron{color:var(--text-3);flex-shrink:0;transition:transform .15s}
.ui-select-trigger:hover{border-color:var(--text-3)!important}
.ui-select-trigger:focus-visible,.ui-select.isOpen .ui-select-trigger{outline:0;border-color:var(--focus)!important;box-shadow:0 0 0 3px rgba(47,109,132,.14)}
.ui-select.isOpen .ui-select-chevron{transform:rotate(180deg)}
.ui-select.isDisabled{opacity:.5}
.ui-select-trigger:disabled{cursor:not-allowed}
.ui-select--compact .ui-select-trigger{min-height:32px;padding:0 8px!important;font-size:13px!important;gap:6px}
.ui-select--quiet .ui-select-trigger{border-color:transparent!important;background:transparent!important;padding-left:0!important;padding-right:0!important;box-shadow:none}
.ui-select--toolbar{width:auto}
.ui-select--toolbar .ui-select-trigger{min-height:30px;padding:0 6px!important;font-size:12px!important;background:transparent!important;border-color:transparent!important}
.ui-select--toolbar .ui-select-trigger:hover{background:var(--hover)!important}
.ui-select-popup{position:fixed;z-index:250;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;border:1px solid var(--line);border-radius:var(--r,8px);background:var(--surface,#fff);box-shadow:var(--shadow-2);padding:4px;box-sizing:border-box;opacity:0;pointer-events:none;font-family:var(--sans)}
.ui-select-popup.isReady{opacity:1;pointer-events:auto}
.ui-select-option{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:8px 10px;border-radius:var(--r-s,6px);color:var(--text);font-size:14px;line-height:1.45;cursor:pointer}
.ui-select-option>span{min-width:0}
.ui-select-option-label{display:block;overflow-wrap:anywhere}
.ui-select-option small{display:block;font-size:12px;line-height:1.5;color:var(--text-3);margin-top:1px}
.ui-select-option.highlighted{background:var(--hover)}
.ui-select-option.selected{color:var(--ink)}
.ui-select-option.selected .ui-select-option-label{font-weight:600}
.ui-select-option.disabled{opacity:.4;cursor:not-allowed}
.ui-select-option>svg,.ui-select-check-space{flex-shrink:0;width:14px}
.ui-select-check-space{display:inline-block;height:14px}
.ui-select-option.highlighted.selected{background:var(--ink-soft)}
</style>
