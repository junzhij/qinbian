<script setup lang="ts">
import { sanitizeHtml } from '@qinbian/shared'
const props=withDefaults(defineProps<{html:string;width?:number;compact?:boolean;maxHeight?:number}>(),{width:375,maxHeight:0})
const host=ref<HTMLElement>(),frame=ref<HTMLIFrameElement>(),height=ref(400),available=ref(375)
let observer:ResizeObserver|undefined,inside:ResizeObserver|undefined
const scale=computed(()=>Math.min(available.value/props.width,props.compact?.76:1))
const size=computed(()=>({height:`${props.maxHeight?Math.min(height.value*scale.value,props.maxHeight):height.value*scale.value}px`}))
const source=computed(()=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><base href="${typeof location!=='undefined'?location.origin:''}/"><style>html,body{margin:0;padding:0;background:#fff;font:15px/1.85 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;overflow-wrap:anywhere}body{padding:18px;box-sizing:border-box}*{box-sizing:border-box}img{max-width:100%;height:auto}p:empty{min-height:1em}</style></head><body>${sanitizeHtml(props.html)}</body></html>`)
function loaded(){inside?.disconnect();const body=frame.value?.contentDocument?.body;if(!body)return;const measure=()=>{height.value=Math.min(12000,Math.max(80,Math.ceil(body.getBoundingClientRect().height)))};measure();inside=new ResizeObserver(measure);inside.observe(body)}
onMounted(()=>{observer=new ResizeObserver(entries=>{available.value=entries[0]?.contentRect.width||375});if(host.value)observer.observe(host.value)})
onBeforeUnmount(()=>{observer?.disconnect();inside?.disconnect()})
</script>
<template><div ref="host" class="html-preview" :class="{compact}" :style="size"><iframe ref="frame" title="图文内容预览" loading="lazy" sandbox="allow-same-origin" :srcdoc="source" :style="{width:width+'px',height:height+'px',transform:`scale(${scale})`}" @load="loaded"/></div></template>
