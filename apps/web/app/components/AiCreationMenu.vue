<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import { creationOptions, type CreationKind } from '~/utils/creation-options'
defineProps<{compact?:boolean}>();const emit=defineEmits<{choose:[kind:CreationKind]}>()
</script>
<template><UiSelect class="ai-creation-launch" :class="{compact}" :options="creationOptions" placeholder="AI 制作" aria-label="AI制作类型" :menu-width="280" :compact="compact" @change="kind=>emit('choose',kind)"><template #leading><Sparkles :size="14"/></template></UiSelect></template>
<style>.ai-creation-launch{width:auto;min-width:122px}.ai-creation-launch .ui-select-trigger{color:#955040;border-color:#decbba!important;background:#f8f0e6!important}.ai-creation-launch .ui-select-trigger>svg:first-child{color:#a7654d;flex-shrink:0}.ai-creation-launch.compact{width:100%;min-width:0}.ai-creation-launch.compact .ui-select-trigger{justify-content:flex-start!important}.ai-creation-launch .ui-select-value{flex:1}</style>
