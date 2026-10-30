<script setup lang="ts">
import type { Resource } from '@qinbian/shared'
const route=useRoute(),ctx=useQinbian(),resource=ref<Resource|null>(null)
async function refresh(){try{resource.value=await apiFetch<Resource>('/api/resources/'+route.params.id)}catch(e){ctx.error(e)}}
onMounted(refresh);watch(()=>route.params.id,refresh)
</script>
<template><ComponentStudio v-if="resource?.kind==='component'" :key="resource.id" :resource="resource" @refresh="refresh"/><ArticleWorkbench v-else-if="resource?.kind==='template'" :key="resource.id" :id="resource.id" target="resource"/><PaletteStudio v-else-if="resource?.kind==='palette'" :key="resource.id" :resource="resource"/><div v-else class="empty-state">正在打开这份版式…</div></template>
