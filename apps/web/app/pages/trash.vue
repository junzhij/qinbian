<script setup lang="ts">
import { RotateCcw, Trash2 } from 'lucide-vue-next'
const ctx=useQinbian(),kind=ref<'resources'|'documents'|'assets'>('resources'),items=ref<any[]>([])
async function refresh(){try{items.value=await apiFetch('/api/'+kind.value,{query:{trash:'true'}})}catch(e){ctx.error(e)}};onMounted(refresh);watch(kind,refresh)
async function restore(item:any){try{await apiFetch('/api/'+kind.value+'/'+item.id+'/restore',{method:'POST'});await refresh();ctx.notify('已放回原处')}catch(e){ctx.error(e)}}
</script>
<template><div class="page"><header class="page-heading"><div><p class="eyebrow">暂存一隅 · 随时找回</p><h1>回收站<span class="title-dot">。</span></h1><p class="page-description">暂时放下的内容，仍留在这里。</p></div></header><div class="tab-line"><button :class="{active:kind==='resources'}" @click="kind='resources'">组件与模板</button><button :class="{active:kind==='documents'}" @click="kind='documents'">文章</button><button :class="{active:kind==='assets'}" @click="kind='assets'">图片</button></div><div v-if="!items.length" class="empty-state"><Trash2 :size="32"/><h3>这里还空着</h3><p>删除的内容会暂存于此，可以随时恢复。</p></div><div class="document-list"><article v-for="item in items" :key="item.id"><div class="document-list-title"><h2>{{item.name||item.title}}</h2><p>{{formatDate(item.deletedAt)}}</p></div><button class="btn" @click="restore(item)"><RotateCcw :size="15"/>恢复</button></article></div></div></template>
