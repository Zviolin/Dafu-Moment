// 公网部署证据截图：登录后逐页打开并截图
import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = 'https://dafu-moment.zviolin.online';
const TOKEN = fs.readFileSync('C:\\Windows\\Temp\\dafu_token.txt', 'utf8').trim();
const USER = fs.readFileSync('C:\\Windows\\Temp\\dafu_user.json', 'utf8').trim();
const OUT = 'g:\\Codes\\WorkPlace\\WorkBuddy\\软件工程作业\\作业06-站立式会议与α冲刺\\60-图册\\公网验证';
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
    { name: '公网-首页', path: '/' },
    { name: '公网-店铺列表', path: '/list' },
    { name: '公网-打卡页', path: '/checkin' },
    { name: '公网-AI助手', path: '/ai' },
];

const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(({ t, u }) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', u);
}, { t: TOKEN, u: USER });
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
page.on('requestfailed', (r) => errors.push('FAILED ' + r.url().slice(0, 120)));

for (const item of PAGES) {
    await page.goto(BASE + item.path, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}\\${item.name}.png` });
    console.log(`${item.name}  ${page.url()}  title=${await page.title()}`);
}

await browser.close();
console.log('errors=' + errors.length);
errors.slice(0, 8).forEach((e) => console.log('  ' + e));
