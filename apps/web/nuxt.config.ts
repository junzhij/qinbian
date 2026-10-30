export default defineNuxtConfig({
  compatibilityDate: '2026-10-29',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  build: { transpile: ['@qinbian/shared'] },
  runtimeConfig: { apiBase: 'http://127.0.0.1:3031' },
  app: { head: { title: '秦编 · 让文字自有章法', htmlAttrs: { lang: 'zh-CN' }, meta: [{ name: 'description', content: '一间属于你的校园图文编排书房。' }] } },
  nitro: { preset: 'node-server' },
  typescript: { strict: true },
  vite: { resolve: { dedupe: ['vue','@vue/runtime-core','@vue/runtime-dom','@vue/reactivity','@vue/shared'] }, optimizeDeps: { exclude: ['vue','@vue/runtime-core','@vue/runtime-dom','@vue/reactivity','@vue/shared'], include: ['lucide-vue-next','ofetch','vuedraggable','@tiptap/core','@tiptap/starter-kit','@tiptap/extension-text-style','@tiptap/extension-text-align','@tiptap/extension-underline','@tiptap/extension-link'] } },
})
