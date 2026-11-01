<script setup lang="ts">
import { Clipboard, TextSelect } from 'lucide-vue-next'
import { copyRichHtml, setRichClipboard } from '~/utils/rich-clipboard'
const props=defineProps<{html:string}>(),emit=defineEmits<{close:[]}>(),ctx=useQinbian(),body=ref<HTMLElement>()
function select(){if(!body.value)return;body.value.focus();const range=document.createRange();range.selectNodeContents(body.value);const s=window.getSelection();s?.removeAllRanges();s?.addRange(range)}
function copy(){if(copyRichHtml(props.html))ctx.notify('正文已带样式复制，请在公众号粘贴核对');else{select();ctx.notify('已全选正文，请按⌘C或Ctrl+C复制')}}
onMounted(()=>nextTick(select))
</script>
<template><UiModal title="带样式复制正文" subtitle="点击复制，或全选正文后按⌘C / Ctrl+C。请使用普通粘贴，以保留样式。" @close="emit('close')"><div class="modal-actions"><button class="btn" @click="select"><TextSelect :size="14"/>全选正文</button><button class="btn primary" @click="copy"><Clipboard :size="14"/>复制含样式正文</button></div><div ref="body" class="manual-copy-content" tabindex="0" @copy="setRichClipboard($event,html)" v-html="html"/></UiModal></template>
