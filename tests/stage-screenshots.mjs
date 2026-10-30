/**
 * 每日成果截图（D2—D7）
 * 做法：每个阶段只打开当天交付的页面，按 1440×900 全页截图；后续页面不进入当天截图。
 * 运行：node tests/stage-screenshots.mjs
 * 前置：docker compose up -d --build，且后端 DEBUG=true（登录需要 debugCode）
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8095';
const API = 'http://localhost:3000';
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const OUT_ROOT = path.resolve('..', '..', '作业06-站立式会议与α冲刺', '60-图册', '每日成果');

/** 每天只展示当天完成的页面；后面的页面不进入当天截图 */
const STAGES = [
    {
        day: 'D2',
        title: '开工日：K0 + 打卡链路',
        pages: [
            ['首页', '/'],
            ['打卡页', '/checkin'],
        ],
    },
    {
        day: 'D3',
        title: '打卡收口 + 成就 + 足迹',
        pages: [
            ['打卡页', '/checkin'],
            ['足迹页', '/footprint'],
            ['成就页', '/achievements'],
        ],
    },
    {
        day: 'D4',
        title: '宠物链路 + 种子数据',
        pages: [
            ['宠物页', '/pet'],
            ['宠物社区', '/pet-community'],
        ],
    },
    {
        day: 'D5',
        title: 'K1 判定：计划 + 档案',
        pages: [
            ['饮食档案', '/ai/profile'],
            ['饮食计划', '/ai/plan'],
        ],
    },
    {
        day: 'D6',
        title: '冻结日：我的 + 设置 + 任务',
        pages: [
            ['我的', '/me'],
            ['设置', '/settings'],
            ['任务', '/tasks'],
            ['报表', '/report'],
            ['共建', '/cobuild'],
        ],
    },
    {
        day: 'D7',
        title: '交付日：管理端',
        pages: [
            ['管理看板', '/admin/dashboard'],
        ],
    },
];

/**
 * 取验证码并登录
 * @param {string} username 用户名
 * @param {string} password 口令
 * @returns {Promise<{token:string,user:object}>}
 */
async function login(username, password) {
    const c = await (await fetch(`${API}/api/auth/captcha`)).json();
    const body = {
        username,
        password,
        captchaId: c.data.captchaId,
        captchaCode: c.data.debugCode,
    };
    const r = await (await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })).json();
    if (!r.data || !r.data.token) throw new Error(`登录失败：${JSON.stringify(r).slice(0, 200)}`);
    return r.data;
}

/**
 * 打开页面并截图
 * @param {import('playwright-core').Page} page 页面
 * @param {string} day 阶段
 * @param {string} label 页面名
 * @param {string} url_path 路径
 * @returns {Promise<void>}
 */
async function shot(page, day, label, url_path) {
    const dir = path.join(OUT_ROOT, day);
    fs.mkdirSync(dir, { recursive: true });
    await page.goto(`${BASE}${url_path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1800);
    const file = path.join(dir, `${String(label).replace(/[\\/:*?"<>|]/g, '-')}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`saved: ${file}`);
}

const student = await login('zhangwl', '123456');
const admin = await login('admin', (process.env.DAFU_ADMIN_PASSWORD || 'admin123'));
const browser = await chromium.launch({ executablePath: EXE, headless: true });

for (const stage of STAGES) {
    const is_admin = stage.day === 'D7';
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const auth = is_admin ? admin : student;
    await ctx.addInitScript(({ token, user }) => {
        localStorage.setItem('fk_token', token);
        localStorage.setItem('fk_user', JSON.stringify(user));
    }, auth);
    const page = await ctx.newPage();
    console.log(`=== ${stage.day} ${stage.title} ===`);
    for (const [label, url_path] of stage.pages) {
        await shot(page, stage.day, label, url_path);
    }
    await ctx.close();
}

await browser.close();
console.log(`全部截图完成：${OUT_ROOT}`);
