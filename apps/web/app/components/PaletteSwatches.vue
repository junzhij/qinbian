<script setup lang="ts">
import { normalizePalette, tones, toneLabels, type Palette } from '@qinbian/shared'
const props=defineProps<{palette?:Palette;compact?:boolean}>()
const p=computed(()=>normalizePalette(props.palette))
function contrast(hex:string){const n=parseInt(hex.slice(1),16),r=n>>16,g=(n>>8)&255,b=n&255;return r*.299+g*.587+b*.114>155?'#24312c':'#fffaf2'}
</script>
<template><div class="palette-swatches" :class="{compact}"><div v-for="c in p.colors" :key="c.id" class="palette-swatch-row"><div class="palette-swatch-name"><strong>{{c.name}}</strong><small>{{c.id}}</small></div><div class="palette-tone-row"><div v-for="tone in tones" :key="tone" :style="{background:c[tone],color:contrast(c[tone])}"><span>{{toneLabels[tone]}}</span><small>{{c[tone].toUpperCase()}}</small></div></div></div></div></template>
