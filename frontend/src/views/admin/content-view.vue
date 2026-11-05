<template>
    <div class="stub-page">
        <b>管理后台 · {{ page }}</b>
        <p>【本地占位桩】原页面文件未入库（.gitignore「admin/」误伤，进展记录问题 1），待管理端补齐。</p>
    </div>
</template>

<script setup>
/** 【本地占位桩】见 admin-layout.vue 头注释 */
const page = 'content';
</script>

<style scoped>
.stub-page { padding: 12px 4px; color: var(--ink-2); font-size: 13px; }
.stub-page b { color: var(--ink); font-size: 15px; display: block; margin-bottom: 8px; }
</style>
