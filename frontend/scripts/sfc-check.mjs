import { readFileSync } from 'node:fs';
import { parse, compileScript } from 'vue/compiler-sfc';
const PAGES = [
    'src/App.vue',                          // 4.5 轮：顶栏去 Logo/搜索框
    'src/views/home-view.vue',              // 4.5 轮：三格 + 横滑窗口
    'src/views/search-view.vue',
    'src/views/map-view.vue',
    'src/components/floating-ai-button.vue',
    'src/views/ai-view.vue',
    'src/views/circle-view.vue',
    'src/views/me-view.vue',
    'src/views/login-view.vue',
    'src/views/diet-profile-view.vue',
    'src/views/diet-plan-view.vue',
];
let fail = 0;
for (const p of PAGES) {
    const src = readFileSync(p, 'utf8');
    try {
        const { descriptor, errors } = parse(src, { filename: p });
        if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
        compileScript(descriptor, { id: p });
        console.log(`PASS ${p}`);
    } catch (e) {
        fail++;
        console.log(`FAIL ${p} :: ${e.message}`);
    }
}
console.log(fail === 0 ? `SFC RESULT: ${PAGES.length}/${PAGES.length} PASS` : `SFC RESULT: ${PAGES.length - fail}/${PAGES.length} PASS, ${fail} FAIL`);
process.exitCode = fail === 0 ? 0 : 1;
