<script setup lang="ts">
import { Search, Plus, SlidersHorizontal, MoreHorizontal, Sparkles, Minus, ChartNoAxesCombined, Pencil, Copy, Trash2, FolderInput } from 'lucide-vue-next'
import { componentInitial, filterComponents, type Resource } from '@qinbian/shared'
const props=defineProps<{items:Resource[];readonly?:boolean;themeSetId?:string}>(),emit=defineEmits<{insert:[resource:Resource];refresh:[];edit:[resource:Resource];generate:[purpose:'component'|'divider'|'chart']}>(),ctx=useQinbian()
const query=ref(''),theme=ref(''),category=ref(''),source=ref<'all'|'mine'|'builtin'>('all'),preview=ref<Resource|null>(null),newOpen=ref(false),name=ref(''),targetTheme=ref('mine'),moving=ref(false),busy=ref(false)
const sourceOptions:{value:'all'|'mine'|'builtin';label:string}[]=[{value:'all',label:'全部来源'},{value:'mine',label:'我制作的'},{value:'builtin',label:'内置组件'}]
const categories=computed(()=>[...new Set(props.items.map(r=>r.category))].sort((a,b)=>a.localeCompare(b,'zh-CN')))
const filtered=computed(()=>filterComponents(props.items,{query:query.value,themeSetId:theme.value,category:category.value,source:source.value}))
const filteredOn=computed(()=>!!(query.value||theme.value||category.value||source.value!=='all'))
function reset(){query.value=theme.value=category.value='';source.value='all'}
function beginNew(){targetTheme.value=ctx.themes.value.find(t=>t.id===props.themeSetId&&!t.builtin)?.id||'mine';name.value='';newOpen.value=true}
async function create(){if(!name.value.trim())return;busy.value=true;try{const r=await apiFetch<Resource>('/api/resources',{method:'POST',body:{name:name.value,kind:'component',themeSetId:targetTheme.value,data:{html:'<section style="padding:20px 0;"><p style="font-size:20px;line-height:1.5;color:{{color1-regular}};" data-qb-field="title">{{title}}</p><p style="font-size:15px;line-height:1.85;" data-qb-field="body">{{body}}</p></section>',fields:[{id:'title',label:'标题',type:'text',default:'在这里写下标题'},{id:'body',label:'正文',type:'text',default:'正文内容'}]}}});newOpen.value=false;emit('refresh');emit('edit',r)}catch(e){ctx.error(e)}finally{busy.value=false}}
async function clone(){if(!preview.value)return;try{const r=await apiFetch<Resource>('/api/resources/'+preview.value.id+'/clone',{method:'POST',body:{themeSetId:'mine'}});preview.value=r;emit('refresh');ctx.notify('已创建副本')}catch(e){ctx.error(e)}}
async function remove(){if(!preview.value||!confirm(`将“${preview.value.name}”移到回收站？`))return;try{await apiFetch('/api/resources/'+preview.value.id,{method:'DELETE'});preview.value=null;emit('refresh')}catch(e){ctx.error(e)}}
async function move(){if(!preview.value)return;try{preview.value=await apiFetch<Resource>('/api/resources/'+preview.value.id,{method:'PUT',body:{...preview.value,themeSetId:targetTheme.value}});moving.value=false;emit('refresh');ctx.notify('已移动')}catch(e){ctx.error(e)}}
</script>
<template><section class="component-shelf" aria-label="插入组件"><div class="shelf-heading"><h3>插入组件</h3><button class="icon-button" aria-label="新建组件" @click="beginNew"><Plus :size="15"/></button></div><label class="search-field small-search"><Search :size="14"/><input v-model="query" placeholder="搜索组件" aria-label="搜索可插入组件"></label><div class="shelf-filters"><label><span class="sr-only">主题套组</span><UiSelect v-model="theme" :options="[{value:'',label:'全部套组'},...ctx.themes.value.map(t=>({value:t.id,label:t.name}))]" aria-label="筛选主题套组" compact/></label><label><span class="sr-only">内容分类</span><UiSelect v-model="category" :options="[{value:'',label:'全部分类'},...categories.map(c=>({value:c,label:c}))]" aria-label="筛选组件分类" compact/></label></div><div class="shelf-filter-foot"><SlidersHorizontal :size="11"/><UiSelect v-model="source" :options="sourceOptions" aria-label="筛选组件来源" variant="quiet" compact/><span>{{filtered.length}} 个</span><button v-if="filteredOn" class="text-button" @click="reset">重置</button></div><div class="shelf-create"><AiCreationMenu compact @choose="kind=>emit('generate',kind)"/></div><div class="insert-resource-list"><div v-for="r in filtered" :key="r.id" class="shelf-row"><button class="shelf-insert" :disabled="readonly" :aria-label="'插入 '+r.name" @click="emit('insert',r)"><small class="component-initial">{{r.legacyId||componentInitial(r.name)}}</small><span>{{r.name}}</span><Plus :size="13"/></button><button class="shelf-more icon-button" :aria-label="'预览和管理 '+r.name" @click="preview=r;moving=false"><MoreHorizontal :size="14"/></button></div><p v-if="!filtered.length" class="shelf-empty">没有匹配的组件。<button v-if="filteredOn" class="text-button" @click="reset">清除筛选</button></p></div>
 <UiModal v-if="preview" :title="preview.name" :subtitle="ctx.themes.value.find(t=>t.id===preview?.themeSetId)?.name+' · '+preview.category" @close="preview=null"><HtmlPreview :html="preview.data.html||''" :max-height="500"/><p class="small muted">{{preview.description}}</p><div class="modal-actions"><button class="btn" @click="emit('edit',preview);preview=null"><Pencil :size="14"/>{{preview.builtin?'编辑副本':'编辑组件'}}</button><button class="btn primary" :disabled="readonly" @click="emit('insert',preview);preview=null"><Plus :size="14"/>插入文章</button></div><div class="shelf-management"><button class="text-button" @click="clone"><Copy :size="12"/>复制</button><button v-if="!preview.builtin" class="text-button" @click="moving=!moving;targetTheme=preview.themeSetId"><FolderInput :size="12"/>移动套组</button><button v-if="!preview.builtin" class="text-button" @click="remove"><Trash2 :size="12"/>移到回收站</button></div><form v-if="moving" class="shelf-move" @submit.prevent="move"><UiSelect v-model="targetTheme" :options="ctx.themes.value.filter(t=>!t.builtin).map(t=>({value:t.id,label:t.name}))" aria-label="保存套组"/><button class="btn">确认移动</button></form></UiModal>
 <UiModal v-if="newOpen" title="新建组件" @close="newOpen=false"><form class="form-stack" @submit.prevent="create"><label>组件名称<input v-model="name" required maxlength="100"></label><label>保存套组<UiSelect v-model="targetTheme" :options="ctx.themes.value.filter(t=>!t.builtin).map(t=>({value:t.id,label:t.name}))" aria-label="保存套组"/></label><div class="modal-actions"><button class="btn primary" :disabled="busy">创建并编辑</button></div></form></UiModal>
</section></template>
<style scoped>
.shelf-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.shelf-heading h3{margin:0;font:600 13px var(--sans);color:var(--text)}
.shelf-heading .icon-button{width:28px;height:28px}
.shelf-filters{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px}
.shelf-filters label{display:grid;min-width:0}
.shelf-filter-foot{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-3);margin:8px 0}
.shelf-filter-foot>span{margin-left:auto;white-space:nowrap}
.shelf-filter-foot .text-button{font-size:12px}
.shelf-create{margin:4px 0 8px}
.shelf-row{display:flex;align-items:center;min-width:0;border-radius:var(--r-s)}
.shelf-row:hover{background:var(--hover)}
.insert-resource-list .shelf-insert{display:flex;align-items:center;gap:8px;min-width:0;flex:1;border:0;text-align:left;padding:7px 4px 7px 6px}
.insert-resource-list .shelf-insert>svg{opacity:0;color:var(--ink);flex-shrink:0}
.shelf-row:hover .shelf-insert>svg{opacity:1}
.shelf-insert>span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.insert-resource-list .component-initial{flex-shrink:0;font:500 11px var(--mono);color:var(--text-3);min-width:26px;margin:0}
.insert-resource-list .shelf-more{width:28px;height:28px;padding:0;border:0;opacity:.5}
.shelf-row:hover .shelf-more{opacity:1}
.shelf-empty{font-size:13px;color:var(--text-3);line-height:1.8;padding:16px 4px}
.shelf-management{display:flex;gap:20px;border-top:1px solid var(--line);margin-top:16px;padding-top:12px}
.shelf-move{display:flex;gap:10px;margin-top:14px}
</style>
