<script setup lang="ts">
import { useId } from 'vue'
import { Sparkles, LoaderCircle, X, ImagePlus, Check, Save } from 'lucide-vue-next'
import { normalizePalette, chartTypes, type AiJob, type Asset, type ComponentData, type ElementSelection, type ArticleTextStyles } from '@qinbian/shared'
import { creationOptions, type CreationKind } from '~/utils/creation-options'
const props=defineProps<{mode?:'component'|'palette';purpose?:CreationKind;allowInsert?:boolean;backgroundColor?:string;selection?:ElementSelection;textStyles?:ArticleTextStyles;settings?:ComponentData;themeSetId?:string;targetType?:'resource'|'document';targetId?:string;targetRevision?:number;blockId?:string;sourceHtml?:string;beforeStart?:()=>Promise<void>}>()
const emit=defineEmits<{applied:[result:any];busy:[value:boolean]}>(),ctx=useQinbian(),promptId=useId()
const kind=ref<CreationKind>(props.purpose||(props.sourceHtml?.includes('data-qb-chart')?'chart':'component')),editCurrent=ref(!!props.sourceHtml)
const prompt=ref(''),model=ref('deepseek-v4-pro'),job=ref<AiJob|null>(null),busy=ref(false),applying=ref(false),showAssets=ref(false),selectedAssets=ref<Asset[]>([]),showBefore=ref(false)
const chartType=ref('line'),chartNames:Record<string,string>={line:'折线图',area:'面积图',bar:'柱状图',horizontalBar:'条形图',pie:'饼图',donut:'环图'}
const colorCount=ref(normalizePalette(props.settings?.palette,ctx.themes.value.find(t=>t.id===props.themeSetId)?.tokens).colors.length)
const locks=ref({text:true,images:true,data:true})
const source=computed(()=>props.selection?props.sourceHtml:editCurrent.value?props.sourceHtml:undefined),candidateSource=computed(()=>job.value?.request.sourceHtml||''),candidateEdit=computed(()=>job.value?.request.operation==='edit')
const running=computed(()=>!!job.value&&['queued','running','validating'].includes(job.value.status))
const stage=computed(()=>({queued:'排队中',running:'生成中',validating:'校验中',ready:'已生成',failed:'生成失败',cancelled:'已取消',applied:'已应用'}[job.value?.status||'ready']))
const selectionMatches=computed(()=>{const old=job.value?.request.selection;return !old||!!props.selection&&old.fingerprint===props.selection.fingerprint&&old.path.join(',')===props.selection.path.join(',')&&job.value?.request.blockId===props.blockId})
watch(running,value=>emit('busy',value),{immediate:true})
const heading=computed(()=>props.selection?'修改选中元素':props.mode==='palette'?'生成配色卡':source.value?'修改组件':kind.value==='chart'?'生成数据图':kind.value==='divider'?'生成分隔符':'生成组件')
let timer:ReturnType<typeof setTimeout>|undefined
watch(()=>props.purpose,value=>{if(value)kind.value=value})
onMounted(async()=>{try{const settings=await apiFetch<any>('/api/settings');model.value=settings.model}catch{}})
onBeforeUnmount(()=>{restoreSequence++;clearTimeout(timer)})
// A completed local edit remains reviewable after reloading and selecting its target again.
let restoreSequence=0
watch(()=>[props.targetType,props.targetId,props.blockId,props.selection?.path.join(','),props.selection?.fingerprint].join('|'),async()=>{
 const sequence=++restoreSequence
 if(!props.targetId||!props.selection||job.value||prompt.value.trim())return
 try{
  const recent=await apiFetch<AiJob[]>('/api/ai/jobs')
  if(sequence!==restoreSequence||job.value||prompt.value.trim())return
  const found=recent.find(j=>['queued','running','validating','ready'].includes(j.status)&&j.request.targetType===props.targetType&&j.request.targetId===props.targetId&&j.request.blockId===props.blockId&&j.request.selection?.path.join(',')===props.selection?.path.join(',')&&j.request.selection?.fingerprint===props.selection?.fingerprint)
  if(!found)return
  job.value=found;prompt.value=found.request.prompt;model.value=found.request.model||model.value;locks.value={text:true,images:true,data:true,...found.request.locks}
  if(running.value)timer=setTimeout(poll,500)
 }catch{}
},{immediate:true})
async function poll(){if(!job.value)return;try{job.value=await apiFetch<AiJob>(`/api/ai/jobs/${job.value.id}`);if(running.value)timer=setTimeout(poll,1200)}catch(e){ctx.error(e)}}
async function start(){
 if(!prompt.value.trim())return;busy.value=true
 try{
  await props.beforeStart?.();await nextTick()
  const request=(props.selection?'':kind.value==='chart'?'制作'+chartNames[chartType.value]+'，图表类型'+chartType.value+'。':kind.value==='divider'?'按分隔符规范制作一枚分隔符。':'')+prompt.value
  job.value=await apiFetch<AiJob>('/api/ai/jobs',{method:'POST',body:{operation:props.mode==='palette'?'palette':source.value?'edit':'generate',designKind:props.selection?(source.value?.includes('data-qb-chart')?'chart':'component'):kind.value,selection:props.selection,locks:props.selection?locks.value:undefined,articleTextStyles:props.textStyles,articleBackgroundColor:props.backgroundColor,colorCount:colorCount.value,settings:source.value?props.settings:undefined,palette:props.settings?.palette,prompt:request,model:model.value,themeSetId:props.themeSetId||'shanhai',targetType:props.targetType,targetId:props.targetId,targetRevision:props.targetRevision,blockId:source.value?props.blockId:undefined,sourceHtml:source.value,assetIds:selectedAssets.value.map(a=>a.id)}})
  colorCount.value=job.value.request.colorCount||colorCount.value;timer=setTimeout(poll,500)
 }catch(e){ctx.error(e)}finally{busy.value=false}
}
async function cancel(){if(!job.value)return;try{job.value=await apiFetch(`/api/ai/jobs/${job.value.id}/cancel`,{method:'POST'})}catch(e){ctx.error(e)}}
async function apply(mode:'save'|'replace'|'insert'){if(!job.value)return;applying.value=true;try{if(mode!=='save'){await props.beforeStart?.();await nextTick()}const result=await apiFetch(`/api/ai/jobs/${job.value.id}/apply`,{method:'POST',body:{mode,revision:props.targetRevision,themeSetId:ctx.themes.value.find(t=>t.id===props.themeSetId&&!t.builtin)?.id||'mine'}});job.value={...job.value,status:'applied'};ctx.notify(mode==='save'?'已保存':'已应用');emit('applied',result)}catch(e){ctx.error(e)}finally{applying.value=false}}
</script>
<template><section class="ai-panel"><div v-if="mode!=='palette'&&!selection" class="ai-kind-control"><label>创作类型</label><UiSelect v-model="kind" :options="creationOptions" aria-label="AI创作类型" :menu-width="280" :disabled="running||busy"/></div><div v-if="sourceHtml&&mode!=='palette'&&!selection" class="ai-operation-tabs" aria-label="制作方式"><button :class="{active:!editCurrent}" :disabled="running" @click="editCurrent=false">新建组件</button><button :class="{active:editCurrent}" :disabled="running" @click="editCurrent=true">修改选中组件</button></div><div v-if="selection" class="ai-element-scope"><strong>范围：选中的一个元素</strong><button v-for="item in [{key:'text',label:'保留文字'},{key:'images',label:'保留图片'},{key:'data',label:'保留数值与分类'}]" :key="item.key" role="switch" :aria-label="item.label" :aria-checked="locks[item.key as keyof typeof locks]" :disabled="running" @click="locks[item.key as keyof typeof locks]=!locks[item.key as keyof typeof locks]"><i :class="{on:locks[item.key as keyof typeof locks]}"/>{{item.label}}</button></div><div class="panel-title"><Sparkles :size="17"/><h3>{{heading}}</h3></div><label class="sr-only" :for="promptId">AI制作要求</label><textarea :id="promptId" v-model="prompt" rows="5" :placeholder="kind==='chart'?'分类、数值、单位与来源':kind==='divider'?'例：居中细线，上下留白 24px，主题减淡色':'例：读书分享会邀请卡，含时间、地点、报名方式'" :disabled="running"/>
 <label v-if="kind==='chart'&&mode!=='palette'&&!selection" class="ai-color-count">数据图类型<UiSelect v-model="chartType" :options="chartTypes.map(t=>({value:t,label:chartNames[t]||t}))" aria-label="数据图类型" :disabled="running" compact/></label>
 <div class="ai-options"><UiSelect v-model="model" :options="[{value:'deepseek-v4-pro',label:'DeepSeek V4 Pro',description:'质量更高'},{value:'deepseek-flash',label:'DeepSeek Flash',description:'速度更快'}]" aria-label="AI模型" :disabled="running" compact/><button class="icon-button" aria-label="为AI选择图片素材" title="选择参考图片素材" @click="showAssets=true"><ImagePlus :size="17"/></button></div>
 <label v-if="!selection" class="ai-color-count">配色数量<UiSelect v-model="colorCount" :options="[3,4,5,6].map(n=>({value:n,label:n+' 色'}))" :disabled="running" aria-label="AI配色数量" compact/></label>
 <div v-if="selectedAssets.length" class="asset-chips"><button v-for="a in selectedAssets" :key="a.id" @click="selectedAssets=selectedAssets.filter(x=>x.id!==a.id)">{{a.name}} ×</button></div>
 <button v-if="!running" class="btn vermilion full" :disabled="busy||!prompt.trim()" @click="start"><Sparkles :size="15"/>{{busy?'正在准备…':job?.status==='failed'?'重新制作':mode==='palette'?'生成配色卡':source?'生成修改候选':kind==='chart'?'生成数据图表':kind==='divider'?'生成分隔符':'生成组件'}}</button><button v-else class="btn full" @click="cancel"><X :size="15"/>取消</button>
 <div v-if="job" class="ai-progress" :class="job.status"><LoaderCircle v-if="running" :size="16" class="spin"/><Check v-else-if="job.status==='ready'||job.status==='applied'" :size="16"/><span>{{stage}}</span></div><p v-if="job?.error" class="error-message">{{job.error}}</p>
 <template v-if="job?.result"><div class="candidate-heading"><h4>{{job.result.name}}</h4><button v-if="candidateSource" class="text-button" @click="showBefore=!showBefore">{{showBefore?'查看候选':'对照原组件'}}</button></div><div class="candidate-preview"><PaletteSwatches v-if="job.result.kind==='palette'" :palette="job.result.palette"/><HtmlPreview v-else :html="showBefore&&candidateSource?candidateSource:job.result.html" :max-height="480"/></div><p class="small muted">{{job.result.description}}</p><div v-if="job.status==='ready'" class="candidate-actions"><button class="btn full" :disabled="applying" @click="apply('save')"><Save :size="14"/>{{job.result.kind==='palette'?'收为配色卡':'另存为组件'}}</button><p v-if="!selectionMatches" class="small muted">选中的元素已变化，重新选回原元素后可应用。</p><button v-if="targetId&&candidateEdit&&job.result.kind!=='palette'" class="btn primary full" :disabled="applying||!selectionMatches" @click="apply('replace')">{{job.request.selection?'替换选中元素':'替换选中组件'}}</button><button v-else-if="targetId&&(allowInsert||targetType==='document')&&job.result.kind!=='palette'" class="btn primary full" :disabled="applying" @click="apply('insert')">插入文章</button></div></template>
 
 <AssetPicker v-if="showAssets" @close="showAssets=false" @select="a=>{if(selectedAssets.length<8&&!selectedAssets.some(x=>x.id===a.id))selectedAssets.push(a);showAssets=false}"/>
</section></template>
<style scoped>
.ai-kind-control{display:grid;gap:6px;margin-bottom:16px}
.ai-kind-control>label{font-size:12px;font-weight:500;color:var(--text-2)}
.ai-operation-tabs{display:flex;gap:2px;padding:3px;background:var(--sunken);border-radius:var(--r);margin-bottom:16px}
.ai-operation-tabs button{flex:1;font-size:13px;font-weight:500;color:var(--text-2);height:30px;border-radius:var(--r-s)}
.ai-operation-tabs button.active{background:var(--surface);color:var(--text);box-shadow:var(--shadow-1)}
.ai-element-scope{display:grid;gap:8px;padding:12px;margin-bottom:16px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r);font-size:13px}
.ai-element-scope button{display:flex;align-items:center;gap:8px;color:var(--text);font-size:13px}
.ai-element-scope i{width:30px;height:18px;border-radius:10px;background:var(--line-strong);position:relative;flex-shrink:0}
.ai-element-scope i:after{content:'';position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}
.ai-element-scope i.on{background:var(--focus)}
.ai-element-scope i.on:after{left:15px}
</style>

