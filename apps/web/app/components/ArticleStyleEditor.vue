<script setup lang="ts">
import { articleTextStylesSchema, normalizeTextStyles, textRoles, roleLabels, restoreTextStyles, applyTextStyles, prepareArticleComponent, type ArticleAppearance, type ArticleTextStyles, type Block, type TextRole } from '@qinbian/shared'
const props=defineProps<{blocks:Block[];appearance:ArticleAppearance;selectedId?:string}>(),emit=defineEmits<{close:[];apply:[styles:ArticleTextStyles|undefined]}>()
const draft=ref(normalizeTextStyles(props.appearance.textStyles)),role=ref<TextRole>('body'),previewId=ref(props.selectedId||props.blocks[0]?.id||'')
const valid=computed(()=>articleTextStylesSchema.safeParse(draft.value).success)
const rule=computed(()=>draft.value.roles[role.value]),preview=computed(()=>{const b=props.blocks.find(b=>b.id===previewId.value);return b?prepareArticleComponent(b,draft.value).html:''})
const counts=computed(()=>{const sum={body:0,heading:0,subheading:0,caption:0,quote:0,independent:0,unclassified:0};for(const b of props.blocks){const s=applyTextStyles(restoreTextStyles(b.html)).summary;for(const key of Object.keys(sum) as (keyof typeof sum)[])sum[key]+=s[key]}return sum})
const fonts=[{value:'inherit' as const,label:'跟随公众号'},{value:'songti' as const,label:'宋体 · 设备字体'},{value:'heiti' as const,label:'黑体 · 设备字体'},{value:'kaiti' as const,label:'楷体 · 设备字体'}]
function reset(){draft.value=normalizeTextStyles()}
</script>
<template><UiModal title="全文样式" subtitle="按文字角色统一设置字号、字体、行距与间距。" wide @close="emit('close')"><div class="article-style-editor"><section><div class="text-role-tabs" role="tablist" aria-label="文字角色"><button v-for="r in textRoles" :key="r" role="tab" :aria-selected="role===r" :class="{active:role===r}" @click="role=r">{{roleLabels[r]}}<small>{{counts[r]}}</small></button></div><div class="style-fields"><label>字号（px）<input v-model.number="rule.fontSize" type="number" min="10" max="24" step="1" aria-label="全文字号"></label><label>行距倍数<input v-model.number="rule.lineHeight" type="number" min="1" max="3" step="0.05" aria-label="全文行距"></label><label>段前（px）<input v-model.number="rule.before" type="number" min="0" max="64" step="1" aria-label="全文段前间距"></label><label>段后（px）<input v-model.number="rule.after" type="number" min="0" max="64" step="1" aria-label="全文段后间距"></label><label>首行缩进（字）<input v-model.number="rule.indent" type="number" min="0" max="4" step="0.5" aria-label="全文首行缩进"></label><label>字距（px）<input v-model.number="rule.letterSpacing" type="number" min="0" max="6" step="0.5" aria-label="全文字距"></label><label>对齐方式<UiSelect v-model="rule.align" :options="[{value:'left',label:'左对齐'},{value:'justify',label:'两端对齐'},{value:'center',label:'居中'},{value:'right',label:'右对齐'}]" aria-label="全文对齐方式"/></label><label>字重<UiSelect v-model="rule.weight" :options="[{value:'400',label:'常规'},{value:'500',label:'中等'},{value:'600',label:'半粗'},{value:'700',label:'加粗'}]" aria-label="全文字重"/></label><label class="style-wide">字体<UiSelect v-model="rule.font" :options="fonts" aria-label="全文字体"/></label><div class="style-wide global-text-color"><span>文字颜色</span><button class="text-button" @click="rule.color=rule.color?null:'#293F4F'">{{rule.color?'改为跟随组件配色':'跟随组件配色 · 可自定义'}}</button><input v-if="rule.color" v-model="rule.color" type="color" aria-label="全文文字颜色"></div></div><button class="style-switch" role="switch" :aria-checked="draft.preserveOverrides" @click="draft.preserveOverrides=!draft.preserveOverrides"><i :class="{on:draft.preserveOverrides}"/><span>保留单独设置过的文字样式</span></button><p class="small muted">图表、表格与代码保持原样。</p><p class="small muted">{{counts.independent}} 处独立区域 · {{counts.unclassified}} 处文字保留原设计</p></section><aside class="article-style-preview"><label>预览组件<UiSelect v-model="previewId" :options="blocks.map((b,i)=>({value:b.id,label:(i+1)+' · '+b.name}))" aria-label="全文样式预览组件"/></label><div class="style-preview-paper" :style="{backgroundColor:appearance.backgroundColor}"><HtmlPreview v-if="preview" :html="preview" :background-color="appearance.backgroundColor" :max-height="550"/></div></aside></div><div class="modal-actions"><button class="text-button" @click="reset">恢复建议值</button><button v-if="appearance.textStyles" class="btn" @click="emit('apply',undefined)">停用并还原</button><button class="btn primary" :disabled="!valid" @click="emit('apply',draft)">应用到全文</button></div></UiModal></template>
<style scoped>
.article-style-editor{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px}
.text-role-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:3px;background:var(--sunken);border-radius:var(--r);margin-bottom:18px}
.text-role-tabs button{flex:1;padding:6px 8px;font-size:13px;font-weight:500;border-radius:var(--r-s);color:var(--text-2);white-space:nowrap}
.text-role-tabs button.active{color:var(--text);background:var(--surface);box-shadow:var(--shadow-1)}
.text-role-tabs small{font-size:11px;margin-left:4px;color:var(--text-3)}
.style-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.style-fields label,.article-style-preview>label{display:grid;gap:6px;font-size:12px;font-weight:500;color:var(--text-2);min-width:0}
.style-fields input[type=number]{width:100%;min-width:0;border:1px solid var(--line-strong);background:var(--surface);padding:7px 10px;font-size:14px;border-radius:var(--r-s)}
.style-wide{grid-column:1/-1}
.global-text-color{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-2);flex-wrap:wrap}
.global-text-color input{height:30px;width:42px;border:0;background:none}
.style-switch{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--text);padding:18px 0 6px}
.style-switch i{display:block;width:30px;height:18px;border-radius:10px;background:var(--line-strong);position:relative;flex-shrink:0}
.style-switch i:after{content:'';position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}
.style-switch i.on{background:var(--focus)}
.style-switch i.on:after{left:15px}
.style-preview-paper{margin-top:14px;border:1px solid var(--line);border-radius:var(--r);padding:8px;min-height:200px;background:#fff}
.article-style-preview{border-left:1px solid var(--line);padding-left:24px}
.article-style-editor .small{font-size:12px;line-height:1.6}
.modal-actions>.text-button{margin-right:auto}
@media(max-width:760px){.article-style-editor{grid-template-columns:1fr}.article-style-preview{border:0;padding:20px 0 0;border-top:1px solid var(--line)}}
</style>
