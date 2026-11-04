<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import { creationOptions, type CreationKind } from '~/utils/creation-options'
defineProps<{compact?:boolean}>();const emit=defineEmits<{choose:[kind:CreationKind]}>()
</script>
<template><UiSelect class="ai-creation-launch" :class="{compact}" :options="creationOptions" placeholder="AI 制作" aria-label="AI制作类型" :menu-width="280" :compact="compact" @change="kind=>emit('choose',kind)"><template #leading><Sparkles :size="14"/></template></UiSelect></template>
<style>
.ai-creation-launch{width:auto;min-width:128px}
.ai-creation-launch .ui-select-trigger{color:var(--red);border-color:#ebcfc6!important;background:var(--red-soft)!important;font-weight:500}
.ai-creation-launch .ui-select-trigger:hover{background:#f1dbd3!important}
.ai-creation-launch .ui-select-trigger>svg:first-child{color:var(--red);flex-shrink:0}
.ai-creation-launch.compact{width:100%;min-width:0}
.ai-creation-launch.compact .ui-select-trigger{justify-content:flex-start!important}
.ai-creation-launch .ui-select-value{flex:1}
</style>
