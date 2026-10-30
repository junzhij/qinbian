<script setup lang="ts">
import { Library, Image, FileText, Settings2, Plus, ChevronDown, ChevronRight, Menu, X, Trash2, Feather } from 'lucide-vue-next'
const route=useRoute(),ctx=useQinbian()
const newTheme=ref(false),themeName=ref(''),themeDescription=ref(''),saving=ref(false)
onMounted(()=>ctx.refreshThemes().catch(ctx.error))
async function createTheme(){if(!themeName.value.trim())return;saving.value=true;try{const t=await apiFetch<any>('/api/theme-sets',{method:'POST',body:{name:themeName.value,description:themeDescription.value,tokens:{墨蓝:'#183A49',灰青:'#567067',朱砂:'#9E4B3B',纸白:'#FFFCF6'},rules:'正文15px，舒展留白，主题颜色保持统一。'}});await ctx.refreshThemes();ctx.chooseTheme(t.id);newTheme.value=false;themeName.value='';themeDescription.value='';ctx.notify('新的套组已经收好')}catch(e){ctx.error(e)}finally{saving.value=false}}
</script>
<template>
 <div class="app-frame">
  <button class="mobile-menu icon-button" aria-label="打开导航" @click="ctx.menuOpen.value=true"><Menu :size="20"/></button>
  <div v-if="ctx.menuOpen.value" class="sidebar-shade" @click="ctx.menuOpen.value=false"/>
  <aside class="app-sidebar" :class="{open:ctx.menuOpen.value}">
   <NuxtLink to="/" class="brand" @click="ctx.menuOpen.value=false"><span class="brand-seal">秦</span><span class="brand-name">秦编<small>一页之间，自有章法</small></span></NuxtLink>
   <button class="sidebar-close icon-button" aria-label="关闭导航" @click="ctx.menuOpen.value=false"><X :size="18"/></button>
   <div class="sidebar-divider"/>
   <nav class="main-navigation" aria-label="主导航">
    <NuxtLink to="/" :class="{active:route.path==='/'||route.path.startsWith('/resources')}" @click="ctx.menuOpen.value=false"><Library :size="17"/><span>资源库</span><span class="nav-marker">藏</span></NuxtLink>
    <NuxtLink to="/assets" :class="{active:route.path==='/assets'}" @click="ctx.menuOpen.value=false"><Image :size="17"/><span>图片素材</span></NuxtLink>
    <NuxtLink to="/documents" :class="{active:route.path.startsWith('/documents')}" @click="ctx.menuOpen.value=false"><FileText :size="17"/><span>我的文章</span></NuxtLink>
   </nav>
   <div class="sidebar-label"><span>主题套组</span><button class="icon-button" aria-label="新建主题套组" @click="newTheme=true"><Plus :size="15"/></button></div>
   <div class="theme-tree">
    <button class="theme-item" :class="{selected:ctx.activeTheme.value===''}" @click="ctx.chooseTheme('')"><Library :size="14"/><span>全部资源</span></button>
    <button v-for="t in ctx.themes.value" :key="t.id" class="theme-item" :class="{selected:ctx.activeTheme.value===t.id&&route.path==='/'}" @click="ctx.chooseTheme(t.id)"><span class="folder-glyph">▱</span><span>{{t.name}}</span><small v-if="t.builtin">内置</small></button>
   </div>
   <div class="sidebar-foot">
    <div class="quiet-verse"><Feather :size="19"/><p>把琐碎交给工具，<br>把心思留给文字。</p></div>
    <NuxtLink to="/trash" @click="ctx.menuOpen.value=false"><Trash2 :size="15"/>回收站</NuxtLink>
    <NuxtLink to="/settings" @click="ctx.menuOpen.value=false"><Settings2 :size="15"/>设置与备份</NuxtLink>
    <span class="local-indicator"><i/>个人书房 · 本地保存</span>
   </div>
  </aside>
  <main class="app-main" :class="{'full-workspace':route.path.startsWith('/documents/')||route.path.startsWith('/resources/')}"><slot/></main>
  <div class="toast-stack" role="status"><div v-for="n in ctx.notices.value" :key="n.id" class="toast" :class="{error:n.error}">{{n.text}}</div></div>
  <UiModal v-if="newTheme" title="新建主题套组" subtitle="为一组相近的版式，留一个位置。" @close="newTheme=false">
   <form class="form-stack" @submit.prevent="createTheme"><label>套组名称<input v-model="themeName" required maxlength="80" placeholder="如：青衿札记" autofocus></label><label>简要说明<textarea v-model="themeDescription" rows="3" placeholder="记录这一套版式的用途与气质。"/></label><div class="modal-actions"><button class="btn" type="button" @click="newTheme=false">取消</button><button class="btn primary" :disabled="saving">{{saving?'正在创建…':'创建套组'}}</button></div></form>
  </UiModal>
 </div>
</template>
