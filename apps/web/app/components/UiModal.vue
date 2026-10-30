<script setup lang="ts">
import { X } from 'lucide-vue-next'
defineProps<{title:string;subtitle?:string;wide?:boolean}>();const emit=defineEmits<{close:[]}>()
const close=(event:KeyboardEvent)=>{if(event.key==='Escape')emit('close')}
onMounted(()=>document.addEventListener('keydown',close));onBeforeUnmount(()=>document.removeEventListener('keydown',close))
</script>
<template><Teleport to="body"><div class="modal-backdrop" @mousedown.self="emit('close')"><section class="modal-sheet" :class="{wide}" role="dialog" aria-modal="true" :aria-label="title"><header class="modal-heading"><div><h2>{{title}}</h2><p v-if="subtitle">{{subtitle}}</p></div><button class="icon-button" aria-label="关闭对话框" @click="emit('close')"><X :size="21"/></button></header><div class="modal-content"><slot/></div></section></div></Teleport></template>
