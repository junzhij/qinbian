<script setup lang="ts">
import { useId } from 'vue'
import { Sparkles, LoaderCircle, X, ImagePlus, Check, Save } from 'lucide-vue-next'
import { normalizePalette, chartTypes, type AiJob, type Asset, type ComponentData } from '@qinbian/shared'
import { creationOptions, type CreationKind } from '~/utils/creation-options'
const props=defineProps<{mode?:'component'|'palette';purpose?:CreationKind;allowInsert?:boolean;backgroundColor?:string;settings?:ComponentData;themeSetId?:string;targetType?:'resource'|'document';targetId?:string;targetRevision?:number;blockId?:string;sourceHtml?:string;beforeStart?:()=>Promise<void>}>()
const emit=defineEmits<{applied:[result:any]}>(),ctx=useQinbian(),promptId=useId()
const kind=ref<CreationKind>(props.purpose||(props.sourceHtml?.includes('data-qb-chart')?'chart':'component')),editCurrent=ref(!!props.sourceHtml)
const prompt=ref(''),model=ref('deepseek-v4-pro'),job=ref<AiJob|null>(null),busy=ref(false),applying=ref(false),showAssets=ref(false),selectedAssets=ref<Asset[]>([]),showBefore=ref(false)
const chartType=ref('line'),chartNames:Record<string,string>={line:'折线图',area:'面积图',bar:'柱状图',horizontalBar:'条形图',pie:'饼图',donut:'环图'}
const colorCount=ref(normalizePalette(props.settings?.palette,ctx.themes.value.find(t=>t.id===props.themeSetId)?.tokens).colors.length)
const source=computed(()=>editCurrent.value?props.sourceHtml:undefined),candidateSource=computed(()=>job.value?.request.sourceHtml||''),candidateEdit=computed(()=>job.value?.request.operation==='edit')
const running=computed(()=>!!job.value&&['queued','running','validating'].includes(job.value.status))
const stage=computed(()=>({queued:'正在准备素材与规范',running:'正在推敲这份版式',validating:'正在检查结构与样式',ready:'候选已完成，请预览确认',failed:'这次制作未完成',cancelled:'已取消制作',applied:'已应用候选'}[job.value?.status||'ready']))
const heading=computed(()=>props.mode==='palette'?'为主题取一组颜色':source.value?'一起修改这枚组件':kind.value==='chart'?'把数据绘成图':kind.value==='divider'?'让段落自然转场':'让灵感成为版式')
let timer:ReturnType<typeof setTimeout>|undefined
watch(()=>props.purpose,value=>{if(value)kind.value=value})
onMounted(async()=>{try{const settings=await apiFetch<any>('/api/settings');model.value=settings.model}catch{}})
onBeforeUnmount(()=>clearTimeout(timer))
async function poll(){if(!job.value)return;try{job.value=await apiFetch<AiJob>(`/api/ai/jobs/${job.value.id}`);if(running.value)timer=setTimeout(poll,1200)}catch(e){ctx.error(e)}}
async function start(){
 if(!prompt.value.trim())return;busy.value=true
 try{
  await props.beforeStart?.();await nextTick()
  const request=(kind.value==='chart'?'制作'+chartNames[chartType.value]+'，图表类型'+chartType.value+'。':kind.value==='divider'?'按分隔符规范制作一枚分隔符。':'')+prompt.value
  job.value=await apiFetch<AiJob>('/api/ai/jobs',{method:'POST',body:{operation:props.mode==='palette'?'palette':source.value?'edit':'generate',designKind:kind.value,articleBackgroundColor:props.backgroundColor,colorCount:colorCount.value,settings:source.value?props.settings:undefined,palette:props.settings?.palette,prompt:request,model:model.value,themeSetId:props.themeSetId||'shanhai',targetType:props.targetType,targetId:props.targetId,targetRevision:props.targetRevision,blockId:source.value?props.blockId:undefined,sourceHtml:source.value,assetIds:selectedAssets.value.map(a=>a.id)}})
  colorCount.value=job.value.request.colorCount||colorCount.value;timer=setTimeout(poll,500)
 }catch(e){ctx.error(e)}finally{busy.value=false}
}
async function cancel(){if(!job.value)return;try{job.value=await apiFetch(`/api/ai/jobs/${job.value.id}/cancel`,{method:'POST'})}catch(e){ctx.error(e)}}
async function apply(mode:'save'|'replace'|'insert'){if(!job.value)return;applying.value=true;try{const result=await apiFetch(`/api/ai/jobs/${job.value.id}/apply`,{method:'POST',body:{mode,revision:props.targetRevision,themeSetId:ctx.themes.value.find(t=>t.id===props.themeSetId&&!t.builtin)?.id||'mine'}});job.value={...job.value,status:'applied'};ctx.notify(mode==='save'?'候选已保存，可重复使用':'候选已应用，原内容保留在历史版本中');emit('applied',result)}catch(e){ctx.error(e)}finally{applying.value=false}}
</script>
<template><section class="ai-panel"><div v-if="mode!=='palette'" class="ai-kind-control"><label>创作类型</label><UiSelect v-model="kind" :options="creationOptions" aria-label="AI创作类型" :menu-width="280" :disabled="running||busy"/></div><div v-if="sourceHtml&&mode!=='palette'" class="ai-operation-tabs" aria-label="制作方式"><button :class="{active:!editCurrent}" :disabled="running" @click="editCurrent=false">新建组件</button><button :class="{active:editCurrent}" :disabled="running" @click="editCurrent=true">修改选中组件</button></div><div class="panel-title"><Sparkles :size="17"/><h3>{{heading}}</h3></div><p class="muted small">描述具体的用途与变化，制作规范会随主题一同使用。</p><label class="sr-only" :for="promptId">AI制作要求</label><textarea :id="promptId" v-model="prompt" rows="5" :placeholder="kind==='chart'?'填写分类、数值、单位与来源；也可明确要求制作示例数据图。':kind==='divider'?'例如：居中细线分隔符，留白24像素，使用主题减淡色。':'例如：读书分享会邀请卡，留出时间、地点和报名说明。'" :disabled="running"/>
 <label v-if="kind==='chart'&&mode!=='palette'" class="ai-color-count">数据图类型<UiSelect v-model="chartType" :options="chartTypes.map(t=>({value:t,label:chartNames[t]||t}))" aria-label="数据图类型" :disabled="running" compact/></label>
 <div class="ai-options"><UiSelect v-model="model" :options="[{value:'deepseek-v4-pro',label:'DeepSeek V4 Pro',description:'精细制作与复杂修改'},{value:'deepseek-flash',label:'DeepSeek Flash',description:'快速试做与日常调整'}]" aria-label="AI模型" :disabled="running" compact/><button class="icon-button" aria-label="为AI选择图片素材" title="选择参考图片素材" @click="showAssets=true"><ImagePlus :size="17"/></button></div>
 <label class="ai-color-count">配色数量<UiSelect v-model="colorCount" :options="[3,4,5,6].map(n=>({value:n,label:n+' 色'}))" :disabled="running" aria-label="AI配色数量" compact/></label>
 <div v-if="selectedAssets.length" class="asset-chips"><button v-for="a in selectedAssets" :key="a.id" @click="selectedAssets=selectedAssets.filter(x=>x.id!==a.id)">{{a.name}} ×</button></div>
 <button v-if="!running" class="btn vermilion full" :disabled="busy||!prompt.trim()" @click="start"><Sparkles :size="15"/>{{busy?'正在准备…':job?.status==='failed'?'重新制作':mode==='palette'?'生成配色卡':source?'生成修改候选':kind==='chart'?'生成数据图表':kind==='divider'?'生成分隔符':'生成组件'}}</button><button v-else class="btn full" @click="cancel"><X :size="15"/>取消本次制作</button>
 <div v-if="job" class="ai-progress" :class="job.status"><LoaderCircle v-if="running" :size="16" class="spin"/><Check v-else-if="job.status==='ready'||job.status==='applied'" :size="16"/><span>{{stage}}</span></div><p v-if="job?.error" class="error-message">{{job.error}}</p>
 <template v-if="job?.result"><div class="candidate-heading"><h4>{{job.result.name}}</h4><button v-if="candidateSource" class="text-button" @click="showBefore=!showBefore">{{showBefore?'查看候选':'对照原组件'}}</button></div><div class="candidate-preview"><PaletteSwatches v-if="job.result.kind==='palette'" :palette="job.result.palette"/><HtmlPreview v-else :html="showBefore&&candidateSource?candidateSource:job.result.html" :max-height="480"/></div><p class="small muted">{{job.result.description}}</p><div v-if="job.status==='ready'" class="candidate-actions"><button class="btn full" :disabled="applying" @click="apply('save')"><Save :size="14"/>{{job.result.kind==='palette'?'收为配色卡':'另存为组件'}}</button><button v-if="targetId&&candidateEdit&&job.result.kind!=='palette'" class="btn primary full" :disabled="applying" @click="apply('replace')">确认替换选中组件</button><button v-else-if="targetId&&(allowInsert||targetType==='document')&&job.result.kind!=='palette'" class="btn primary full" :disabled="applying" @click="apply('insert')">加入当前编排</button></div></template>
 <p class="ai-note">仅发送制作要求、所选内容与必要规范。候选不会自动覆盖原稿。</p>
 <AssetPicker v-if="showAssets" @close="showAssets=false" @select="a=>{if(selectedAssets.length<8&&!selectedAssets.some(x=>x.id===a.id))selectedAssets.push(a);showAssets=false}"/>
</section></template>
<style scoped>.ai-kind-control{display:grid;gap:8px;margin-bottom:20px}.ai-kind-control>label{font-size:10px;color:#8f9b82}.ai-operation-tabs{display:flex;gap:3px;padding:3px;background:#efeee4;border:1px solid var(--line);border-radius:4px;margin-bottom:22px}.ai-operation-tabs button{flex:1;font-size:10px;color:#8a9781;padding:7px 4px;border-radius:2px}.ai-operation-tabs button.active{background:#fffdf7;color:var(--ink);box-shadow:0 1px 3px #183a4910}</style>
