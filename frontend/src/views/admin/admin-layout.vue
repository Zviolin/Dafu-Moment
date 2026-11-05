<template>
    <div class="admin-stub">
        <aside class="side">
            <b>管理后台（本地占位桩）</b>
            <span>dashboard / audit / content / governance / ai-providers / fzu-accounts</span>
        </aside>
        <main class="main"><router-view /></main>
    </div>
</template>

<script setup>
/**
 * 【本地占位桩】admin-layout：原 admin 6 文件因 .gitignore「admin/」误伤从未入库（进展记录问题 1），
 * 本桩仅为让 vite dev / 构建可跑通，不做任何真实功能。管理端文件补齐后整体替换本目录。
 */
</script>

<style scoped>
.admin-stub { display: flex; min-height: 100vh; }
.side { width: 200px; border-right: 1px solid var(--line); padding: 18px 14px; display: flex; flex-direction: column; gap: 10px; color: var(--ink-2); font-size: 12px; }
.side b { color: var(--ink); font-size: 14px; }
.main { flex: 1; padding: 20px; }
</style>
