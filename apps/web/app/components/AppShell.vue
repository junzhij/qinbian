<script setup lang="ts">
import { Library, Image, FileText, Settings2, Plus, Menu, X, Trash2 } from 'lucide-vue-next'
const route=useRoute(),ctx=useQinbian()
const newTheme=ref(false),themeName=ref(''),themeDescription=ref(''),saving=ref(false)
const rail=computed(()=>/^\/(documents|resources)\/[^/]+/.test(route.path))
const swatch=(tokens:Record<string,string>|undefined)=>Object.values(tokens||{}).slice(0,4)
onMounted(()=>ctx.refreshThemes().catch(ctx.error))
async function createTheme(){if(!themeName.value.trim())return;saving.value=true;try{const t=await apiFetch<any>('/api/theme-sets',{method:'POST',body:{name:themeName.value,description:themeDescription.value,tokens:{墨蓝:'#183A49',灰青:'#567067',朱砂:'#9E4B3B',纸白:'#FFFCF6'},rules:'正文15px，舒展留白，主题颜色保持统一。'}});await ctx.refreshThemes();ctx.chooseTheme(t.id);newTheme.value=false;themeName.value='';themeDescription.value='';ctx.notify('套组已创建')}catch(e){ctx.error(e)}finally{saving.value=false}}
</script>
<template>
 <div class="app-frame" :class="{rail}">
  <button class="mobile-menu icon-button" aria-label="打开导航" @click="ctx.menuOpen.value=true"><Menu :size="20"/></button>
  <div v-if="ctx.menuOpen.value" class="sidebar-shade" @click="ctx.menuOpen.value=false"/>
  <aside class="app-sidebar" :class="{open:ctx.menuOpen.value}">
   <NuxtLink to="/documents" class="brand" title="秦编" @click="ctx.menuOpen.value=false"><span class="brand-seal">秦</span><span class="brand-name">秦编</span></NuxtLink>
   <button class="sidebar-close icon-button" aria-label="关闭导航" @click="ctx.menuOpen.value=false"><X :size="18"/></button>
   <div class="sidebar-divider"/>
   <nav class="main-navigation" aria-label="主导航">
    <NuxtLink to="/documents" title="文章" :class="{active:route.path.startsWith('/documents')}" @click="ctx.menuOpen.value=false"><FileText :size="18"/><span>文章</span></NuxtLink>
    <NuxtLink to="/resources" title="资源库" :class="{active:route.path.startsWith('/resources')}" @click="ctx.menuOpen.value=false;ctx.chooseTheme('')"><Library :size="18"/><span>资源库</span></NuxtLink>
    <NuxtLink to="/assets" title="图片素材" :class="{active:route.path==='/assets'}" @click="ctx.menuOpen.value=false"><Image :size="18"/><span>图片素材</span></NuxtLink>
   </nav>
   <div class="sidebar-label"><span>主题套组</span><button class="icon-button" aria-label="新建主题套组" title="新建主题套组" @click="newTheme=true"><Plus :size="15"/></button></div>
   <div class="theme-tree">
    <button v-for="t in ctx.themes.value" :key="t.id" class="theme-item" :class="{selected:ctx.activeTheme.value===t.id&&route.path==='/resources'}" @click="ctx.chooseTheme(t.id);ctx.menuOpen.value=false"><span class="theme-swatch"><i v-for="(c,i) in swatch(t.tokens)" :key="i" :style="{background:c}"/></span><span>{{t.name}}</span><small v-if="t.builtin">内置</small></button>
   </div>
   <div class="sidebar-foot">
    <NuxtLink to="/trash" title="回收站" :class="{active:route.path==='/trash'}" @click="ctx.menuOpen.value=false"><Trash2 :size="18"/><span>回收站</span></NuxtLink>
    <NuxtLink to="/settings" title="设置与备份" :class="{active:route.path==='/settings'}" @click="ctx.menuOpen.value=false"><Settings2 :size="18"/><span>设置与备份</span></NuxtLink>
    <span class="local-indicator"><i/>本地保存</span>
   </div>
  </aside>
  <main class="app-main"><slot/></main>
  <div class="toast-stack" role="status"><div v-for="n in ctx.notices.value" :key="n.id" class="toast" :class="{error:n.error}">{{n.text}}</div></div>
  <UiModal v-if="newTheme" title="新建主题套组" @close="newTheme=false">
   <form class="form-stack" @submit.prevent="createTheme"><label>名称<input v-model="themeName" required maxlength="80" placeholder="如：青衿札记" autofocus></label><label>说明<textarea v-model="themeDescription" rows="3" placeholder="用途、风格"/></label><div class="modal-actions"><button class="btn" type="button" @click="newTheme=false">取消</button><button class="btn primary" :disabled="saving">{{saving?'正在创建…':'创建'}}</button></div></form>
  </UiModal>
 </div>
</template>
