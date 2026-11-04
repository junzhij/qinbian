<script setup lang="ts">
import { dividerStyles, makeDivider, prepareComponent, normalizePalette, type Palette, type Resource, type DividerStyle } from '@qinbian/shared'
const props=defineProps<{themeSetId?:string;palette?:Palette}>(),emit=defineEmits<{close:[];custom:[];created:[resource:Resource,insert:boolean]}>(),ctx=useQinbian(),style=ref<DividerStyle>('hairline'),title=ref('下一章'),name=ref(''),theme=ref(ctx.themes.value.find(t=>t.id===props.themeSetId&&!t.builtin)?.id||'mine'),busy=ref(false)
const data=computed(()=>prepareComponent({...makeDivider(style.value,title.value),palette:props.palette||normalizePalette(ctx.themes.value.find(t=>t.id===theme.value)?.palette)}))
async function generate(insert:boolean){busy.value=true;try{const r=await apiFetch<Resource>('/api/resources',{method:'POST',body:{kind:'component',themeSetId:theme.value,name:name.value.trim()||'分隔 · '+dividerStyles.find(s=>s.id===style.value)!.name,description:'段落转场与章节分隔',category:'章节与分隔',tags:['分隔符',style.value],data:data.value}});ctx.notify('分隔符已生成');emit('created',r,insert)}catch(e){ctx.error(e)}finally{busy.value=false}}
</script>
<template><UiModal title="生成分隔符" @close="!busy&&emit('close')"><div class="divider-style-tabs"><button v-for="s in dividerStyles" :key="s.id" :class="{active:style===s.id}" @click="style=s.id">{{s.name}}</button></div><div class="divider-live-preview"><HtmlPreview :html="data.html" :max-height="180"/></div><form class="form-stack" @submit.prevent="generate(true)"><label v-if="style==='chapter'">章节标题<input v-model="title" maxlength="100"></label><label>组件名称<input v-model="name" :placeholder="'分隔 · '+dividerStyles.find(s=>s.id===style)?.name" maxlength="100"></label><label>保存套组<UiSelect v-model="theme" :options="ctx.themes.value.filter(t=>!t.builtin).map(t=>({value:t.id,label:t.name}))" aria-label="保存套组"/></label><div class="modal-actions"><button class="btn" type="button" :disabled="busy" @click="generate(false)">仅保存组件</button><button class="btn primary" :disabled="busy">{{busy?'正在生成…':'生成并插入'}}</button></div></form><button class="text-button" @click="emit('custom')">用 AI 生成其他样式</button></UiModal></template>
<style scoped>
.divider-style-tabs{display:flex;flex-wrap:wrap;gap:6px}
.divider-style-tabs button{font-size:13px;color:var(--text-2);height:32px;padding:0 12px;border:1px solid var(--line-strong);border-radius:999px}
.divider-style-tabs button:hover{color:var(--text)}
.divider-style-tabs .active{background:var(--text);border-color:var(--text);color:#fff}
.divider-live-preview{padding:20px 0;margin:16px 0;border:1px solid var(--line);border-radius:var(--r);background:#fff}
.form-stack+.text-button{margin-top:16px}
</style>
