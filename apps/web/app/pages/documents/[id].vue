<script setup lang="ts">const route=useRoute()</script>
<template><ArticleWorkbench :key="String(route.params.id)" :id="String(route.params.id)" target="document"/></template>
