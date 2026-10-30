<template>
    <div class="page-wrap ai-page">
        <!-- 功能入口：智能推荐通栏大卡 + 2×2 四宫格（每卡 = 插画 + 标题 + 一句描述；对齐 P16 入口卡形态） -->
        <div class="sec" style="padding-top: 16px;"><b>福宝能帮你</b></div>
        <div class="entry-grid">
            <a class="entry card fade-up wide" @click="go_chat_anchor">
                <img class="ill" src="/assets/pet/e-happy.png" alt="智能推荐" />
                <div class="et">
                    <b>智能推荐</b>
                    <span>说出想法，福宝按全站真实评分帮你挑</span>
                </div>
                <svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
            </a>
            <router-link class="entry card fade-up" to="/ai/plan" style="animation-delay:.05s">
                <img class="ill" src="/assets/icons/ill-checkin.png" alt="个性化饮食计划" />
                <div class="et">
                    <b>个性化饮食计划</b>
                    <span>按预算与忌口生成 1 / 3 / 7 日三餐</span>
                </div>
                <svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
            </router-link>
            <router-link class="entry card fade-up" to="/ai/mbti" style="animation-delay:.1s">
                <img class="ill" src="/assets/icons/ill-mbti.png" alt="口味画像 饭MBTI" />
                <div class="et">
                    <b>口味画像 · 饭MBTI</b>
                    <span>一分钟测出你的口味人格</span>
                </div>
                <svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
            </router-link>
            <router-link class="entry card fade-up" to="/ai/wheel" style="animation-delay:.15s">
                <img class="ill" src="/assets/icons/ill-wheel.png" alt="餐品转盘" />
                <div class="et">
                    <b>餐品转盘</b>
                    <span>选择困难？转一转今晚吃什么</span>
                </div>
                <svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
            </router-link>
            <router-link class="entry card fade-up" to="/ai/profile" style="animation-delay:.2s">
                <img class="ill" src="/assets/icons/icon-want.png" alt="饮食偏好档案" />
                <div class="et">
                    <b>饮食偏好档案</b>
                    <span>忌口 / 过敏 / 预算，一次设置全通用</span>
                </div>
                <svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
            </router-link>
        </div>

        <!-- 智能推荐对话区（入口卡锚点落点；操作入口收敛进对话卡会话头） -->
        <div id="ai-chat" class="sec"><b>智能推荐</b></div>

        <!-- 降级提示（AC24：AI 接口不可用或后端标记降级时展示；r89 追加具体原因，便于用户自查配置） -->
        <div v-if="degraded" class="degrade-tip">
            AI 暂不可用，已为你切换为热门推荐
            <span v-if="degraded_reason" class="degrade-why">{{ degraded_reason }}</span>
        </div>

        <!-- 快捷提问 chips（点击即发送；原型 P16 顺序：问候 → 快捷词 → 对话） -->
        <div v-if="auth.is_login" class="quick">
            <span v-for="q in QUICK_ASKS" :key="q" @click="quick_ask(q)">{{ q }}</span>
        </div>

        <!-- 对话流：消息随页面滚动（原型 P16 同款页面流对话，去掉内滚动卡） -->
        <div class="chat-card card fade-up">
            <!-- 会话头：福宝身份 + 新对话 / 历史对话 / 模型设置（登录态显示操作钮） -->
            <div class="chat-head">
                <div class="head-id">
                    <img class="head-face" src="/assets/icons/grid-avatar.png" alt="福宝" />
                    <div class="head-name">
                        <b>福宝</b>
                        <span>按全站真实评分帮你推荐</span>
                    </div>
                </div>
                <div v-if="auth.is_login" class="head-ops">
                    <button type="button" class="head-btn" title="开始新对话" @click="new_chat">
                        <el-icon :size="13"><Plus /></el-icon><span>新对话</span>
                    </button>
                    <button type="button" class="head-btn" title="历史对话" @click="open_history">
                        <el-icon :size="13"><Clock /></el-icon><span>历史对话</span>
                    </button>
                    <button type="button" class="head-btn icon-only" title="模型设置" aria-label="模型设置" @click="open_cfg">
                        <el-icon :size="15"><Setting /></el-icon>
                    </button>
                </div>
            </div>
            <hr class="hairline" />
            <!-- 未登录引导 -->
            <div v-if="!auth.is_login" class="login-guide">
                <img class="guide-pet" src="/assets/icons/grid-avatar.png" alt="福宝" />
                <p>登录后就能和福宝聊天啦，它会按全平台真实评分给你推荐~</p>
                <el-button type="primary" class="go-login" @click="go_login">去登录</el-button>
            </div>
            <template v-else>
                <div v-for="m in messages" :key="m.id" class="msg" :class="m.role">
                    <span v-if="m.role === 'ai'" class="ai-face"><img src="/assets/icons/grid-avatar.png" alt="福宝" /></span>
                    <user-avatar v-else :user="auth.user" :size="32" class="avatar-fix" />
                    <div class="chat-bub">
                        <p class="text">{{ m.text }}</p>
                        <!-- 推荐小卡：整卡点击进详情，带推荐理由文案；右上地图钮定位所属餐厅 -->
                        <div v-if="m.recs && m.recs.length" class="recs">
                            <div v-for="(r, i) in m.recs" :key="i" class="rec-card" @click="go_rec(r)">
                                <img v-if="r.img" class="rec-img" :src="r.img" :alt="r.name" />
                                <span v-else class="img-fallback rec-img">{{ (r.name || '荐')[0] }}</span>
                                <div class="rec-main">
                                    <b class="rec-name">{{ r.name }}</b>
                                    <span v-if="r.station_name" class="rec-sub">{{ r.station_name }}</span>
                                    <span class="rec-reason">推荐理由：{{ r.reason || '综合评分较高' }}</span>
                                </div>
                                <button
                                    type="button" class="rec-ico"
                                    title="在地图上查看它所属餐厅的位置"
                                    aria-label="在地图上查看它所属餐厅的位置"
                                    @click.stop="go_map(r)"
                                >
                                    <el-icon :size="15"><MapLocation /></el-icon>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-if="sending" class="msg ai">
                    <span class="ai-face"><img src="/assets/icons/grid-avatar.png" alt="福宝" /></span>
                    <div class="chat-bub"><p class="text thinking">福宝思考中……</p></div>
                </div>
            </template>
        </div>

        <!-- 底部输入区（固定悬浮在 tabbar 上方，原型 .inputbar 同款；两行式：上行 textarea 自动增高，下行模型快切 chip + 发送钮） -->
        <div v-if="auth.is_login" class="input-bar card">
            <el-input
                ref="ask_input" v-model="draft" type="textarea" resize="none" maxlength="500"
                :autosize="{ minRows: 1, maxRows: 4 }"
                class="ask-input" placeholder="问问福宝：想吃辣的又不贵，有推荐吗？"
                @keydown.enter.exact="on_ask_keydown"
            />
            <div class="input-ops">
                <el-popover v-model:visible="picker_open" placement="top-start" :width="324" trigger="click" :teleported="false" popper-class="model-picker" @show="load_models">
                    <template #reference>
                        <button type="button" class="model-chip" :class="{ on: ai_ready }" title="切换 / 删除模型">
                            <i class="chip-dot"></i>
                            <span class="chip-name">{{ ai_ready ? selected_name : '规则推荐' }}</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                        </button>
                    </template>
                    <!-- 快切面板：平台模型（官方提供免配置）+ 我的模型；「管理」进模型设置弹窗 -->
                    <div class="mp-head">
                        <span class="mp-title">使用中的模型</span>
                        <a class="mp-manage" @click.prevent="picker_open = false; open_cfg()">管理</a>
                    </div>
                    <template v-if="platform.length">
                        <div class="mp-group">平台模型 · 官方提供</div>
                        <div class="mp-list">
                            <div v-for="p in platform" :key="'p' + p.id" class="mp-item" :class="{ sel: p.selected }" :title="p.modelId" @click="!p.selected && use_platform(p)">
                                <b class="mp-name">{{ p.name }}</b>
                                <span v-if="p.selected" class="mp-using">使用中</span>
                            </div>
                        </div>
                    </template>
                    <template v-if="models.length">
                        <div v-if="platform.length" class="mp-group">我的模型</div>
                        <div class="mp-list">
                            <div v-for="m in models" :key="m.id" class="mp-item" :class="{ sel: m.isSelected }" :title="m.modelId" @click="!m.isSelected && use_model(m)">
                                <b class="mp-name">{{ m.displayName || m.modelId }}</b>
                                <span v-if="m.isSelected" class="mp-using">使用中</span>
                                <!-- 测试连通性（r89）：不发消息，只验一次真实请求；点后行内反馈 -->
                                <span class="mp-test" :class="{ busy: testing_id === m.id }" title="测试这个模型能否正常调用" @click.stop="test_saved(m)">
                                    {{ testing_id === m.id ? '测试中' : '测试' }}
                                </span>
                                <el-icon class="mp-del" title="删除" @click.stop="remove_model(m)"><Delete /></el-icon>
                            </div>
                        </div>
                    </template>
                    <div v-if="!models.length && !platform.length" class="mp-empty">还没有可用模型，点「管理」配置一个吧</div>
                </el-popover>
                <el-button
                    type="primary" circle class="send-btn" :loading="sending"
                    :icon="Promotion" title="发送" aria-label="发送"
                    @click="do_ask"
                />
            </div>
        </div>

        <!-- 合规声明（AC24：AI 输出页面固定展示） -->
        <p class="compliance">以上内容仅供参考，不替代专业医生、营养师的医疗诊断与营养方案。</p>

        <!-- 模型设置弹窗（保留原有多模型配置功能：列表可切换 + 添加/编辑表单） -->
        <el-dialog v-model="cfg_open" title="模型设置" width="480px">
            <div class="cfg-state" :class="{ on: ai_ready }">
                {{ ai_ready ? `使用中 · ${selected_name}` : '规则推荐模式（未添加模型）' }}
            </div>
            <div class="cfg-tip">
                平台模型由官方提供，点「使用」直接生效；自配模型选供应商自动带出接口地址，密钥加密存储，福宝只依据平台真实数据作答。
            </div>

            <!-- 连通性测试结果（列表态，r89）：成功给延迟，失败给原因与排查建议（不落库、不计费） -->
            <div v-if="test_result && !mode" class="test-box" :class="test_result.ok ? 'ok' : 'bad'">
                <b class="tb-title">{{ test_result.ok ? '连接成功' : '连接失败' }}</b>
                <span v-if="test_result.ok" class="tb-main">{{ test_result.model }} · 延迟 {{ test_result.latencyMs }}ms</span>
                <template v-else>
                    <span class="tb-main">{{ test_result.hint }}</span>
                    <span v-if="test_result.error" class="tb-err">{{ test_result.error }}</span>
                </template>
            </div>

            <!-- 平台托管模型：官方配置免密钥，点「使用」即切换 -->
            <template v-if="platform.length">
                <div class="cfg-group">平台模型 · 官方提供</div>
                <div class="model-list">
                    <div v-for="p in platform" :key="'p' + p.id" class="model-item" :class="{ sel: p.selected }">
                        <div class="mi-main" :title="p.modelId" @click="!p.selected && use_platform(p)">
                            <b class="mi-name">{{ p.name }}</b>
                            <span class="mi-meta">
                                平台提供 · {{ p.modelId }}
                                <i class="mi-proto" :class="{ ant: p.protocol === 'anthropic' }">{{ p.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容' }}</i>
                            </span>
                        </div>
                        <span v-if="p.selected" class="mi-using">使用中</span>
                        <span v-else class="mi-use" @click="use_platform(p)">使用</span>
                    </div>
                </div>
            </template>

            <!-- 已添加模型列表：点「使用」切换生效配置 -->
            <div v-if="platform.length && models.length" class="cfg-group">我的模型 · 自行配置</div>
            <div v-if="models.length" class="model-list">
                <div v-for="m in models" :key="m.id" class="model-item" :class="{ sel: m.isSelected }">
                    <div class="mi-main" :title="m.baseUrl" @click="!m.isSelected && use_model(m)">
                        <b class="mi-name">{{ m.displayName || m.modelId }}</b>
                        <span class="mi-meta">
                            {{ provider_name(m.provider) }} · {{ m.modelId }}
                            <i class="mi-proto" :class="{ ant: m.protocol === 'anthropic' }">{{ m.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容' }}</i>
                        </span>
                    </div>
                    <span v-if="m.isSelected" class="mi-using">使用中</span>
                    <span v-else class="mi-use" @click="use_model(m)">使用</span>
                    <!-- 连通性测试（r89）：直接测已保存配置，密钥不必重填 -->
                    <span class="mi-test" :class="{ busy: testing_id === m.id }" @click="test_saved(m)">
                        {{ testing_id === m.id ? '测试中' : '测试' }}
                    </span>
                    <el-icon class="mi-op" title="编辑" @click="start_edit(m)"><EditPen /></el-icon>
                    <el-icon class="mi-op danger" title="删除" @click="remove_model(m)"><Delete /></el-icon>
                </div>
            </div>

            <!-- 添加/编辑：pick = 供应商选择列表（点击进表单）；add/edit = 配置表单 -->
            <div class="form-sep">
                <div v-if="mode === 'pick'" class="prov-grid">
                    <button v-for="p in providers" :key="p.providerKey" type="button" class="prov-item" @click="start_form(p)">
                        <span class="prov-name">{{ p.name }}</span>
                        <span class="prov-arrow">›</span>
                    </button>
                </div>
                <template v-else-if="mode">
                    <el-form label-width="72px" @submit.prevent="save_model">
                        <el-form-item label="供应商">
                            <span class="prov-fixed">{{ provider_name(form.provider) }}</span>
                            <button v-if="mode === 'add'" type="button" class="prov-repick" @click="mode = 'pick'">重选 ›</button>
                        </el-form-item>
                        <el-form-item label="接口类型">
                            <el-select v-model="form.protocol" class="provider-select">
                                <el-option value="openai" label="OpenAI 兼容格式" />
                                <el-option value="anthropic" label="Anthropic Messages 格式" />
                            </el-select>
                        </el-form-item>
                        <el-form-item label="接口地址">
                            <el-input v-model="form.baseUrl" placeholder="https://api.example.com/v1（以官方文档为准）" />
                        </el-form-item>
                        <el-form-item label="模型 ID">
                            <el-input v-model="form.modelId" placeholder="填写官方模型名，如 deepseek-chat" />
                        </el-form-item>
                        <el-form-item label="展示名称">
                            <el-input v-model="form.displayName" maxlength="64" placeholder="选填：列表中展示的名称" />
                        </el-form-item>
                        <el-form-item label="API Key">
                            <el-input
                                v-model="form.apiKey" type="password" show-password
                                :placeholder="mode === 'edit' && edit_mask ? `已保存：${edit_mask}（输入新值覆盖，留空保留）` : 'sk-...'"
                            />
                        </el-form-item>
                        <!-- 保存前先验一次：用表单当前值真实请求（不落库；编辑态留空密钥自动复用已保存密文） -->
                        <el-form-item label="连通测试">
                            <el-button size="small" :loading="testing_form" @click="test_form">测试连接</el-button>
                            <span class="form-test-tip">发一次真实请求确认可用，不保存配置</span>
                        </el-form-item>
                    </el-form>
                    <!-- 表单内测试结果（r89）：紧跟操作位置，避免结果出现在列表顶部需回滚查看 -->
                    <div v-if="test_result && mode" class="test-box form" :class="test_result.ok ? 'ok' : 'bad'">
                        <b class="tb-title">{{ test_result.ok ? '连接成功' : '连接失败' }}</b>
                        <span v-if="test_result.ok" class="tb-main">{{ test_result.model }} · 延迟 {{ test_result.latencyMs }}ms</span>
                        <template v-else>
                            <span class="tb-main">{{ test_result.hint }}</span>
                            <span v-if="test_result.error" class="tb-err">{{ test_result.error }}</span>
                        </template>
                    </div>
                    <div v-if="cur_provider && (cur_provider.consoleUrl || cur_provider.modelDocUrl)" class="doc-links">
                        <span class="doc-label">官方文档：</span>
                        <a v-if="cur_provider.consoleUrl" :href="cur_provider.consoleUrl" target="_blank" rel="noopener" class="doc-link">接口控制台</a>
                        <a v-if="cur_provider.modelDocUrl" :href="cur_provider.modelDocUrl" target="_blank" rel="noopener" class="doc-link">模型接入文档</a>
                    </div>
                </template>
                <el-button v-else size="small" class="add-model-btn" @click="mode = 'pick'">＋ 添加模型</el-button>
            </div>

            <template #footer>
                <div class="cfg-ops">
                    <el-button v-if="mode" size="small" @click="cancel_form">取消</el-button>
                    <el-button v-if="mode === 'add' || mode === 'edit'" type="primary" size="small" :loading="ai_saving" @click="save_model">
                        {{ mode === 'edit' ? '保存修改' : '添加模型' }}
                    </el-button>
                </div>
            </template>
        </el-dialog>

        <!-- 历史对话抽屉：查看回显 / 单条删除 / 清空全部 / 开始新对话 -->
        <el-drawer v-model="hist_open" title="历史对话" size="360px">
            <div class="hist-ops">
                <el-button size="small" @click="new_chat">＋ 新对话</el-button>
                <el-button v-if="hist_list.length" size="small" type="danger" plain @click="clear_all">清空全部</el-button>
            </div>
            <div v-if="hist_list.length === 0" class="hist-empty">暂无历史对话，去问福宝一句吧～</div>
            <div v-for="h in hist_list" :key="h.id" class="hist-item">
                <div class="hist-main" title="点击查看这轮对话" @click="view_history(h)">
                    <p class="hist-q">{{ h.question }}</p>
                    <p class="hist-a">{{ h.answer }}</p>
                    <span class="hist-time">{{ time_ago(h.createdAt) }}</span>
                </div>
                <button type="button" class="hist-del" title="删除这条记录" aria-label="删除这条记录" @click="del_history(h)">
                    <el-icon :size="14"><Delete /></el-icon>
                </button>
            </div>
        </el-drawer>
    </div>
</template>

<script setup>
/**
 * AI 助手「福宝」主页（对齐 P16-AI助手.html，暖纸奶油风改版）
 * 结构：顶部横幅（IP + 问候）→ 功能入口卡 → 智能推荐对话区 → 合规声明
 * 保留原 api_ai.ask / history 接线与历史回显逻辑；
 * AC24：接口不可用时降级为按时段规则化热门推荐，并展示降级提示与固定合规声明
 * 会话缓存：App.vue keep-alive(include) 缓存本页——跳详情再返回对话/草稿/发送态全保留，
 * 离开时记录滚动位置（sessionStorage），回来恢复到离开时的阅读位置
 */
defineOptions({ name: 'AiView' });
import { ref, computed, nextTick, onActivated, onDeactivated, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { EditPen, Delete, Promotion, MapLocation, Plus, Clock, Setting } from '@element-plus/icons-vue';
import { api_ai, api_content } from '../api';
import { useAuthStore } from '../stores/auth';
import UserAvatar from '../components/user-avatar.vue';
import { time_ago, img_url } from '../utils/format';

const router = useRouter();
const auth = useAuthStore();
const messages = ref([]);
const draft = ref('');
const sending = ref(false);
const degraded = ref(false);
/** 降级原因（r89：后端回传的中文排障提示，展示在降级提示条内） */
const degraded_reason = ref('');
const ask_input = ref(null);
let msg_seq = 0;

/** 快捷提问词（点击即发送） */
const QUICK_ASKS = ['今天吃什么', '不想吃太辣', '30 元以内'];

// AI 降级时段问候语（推荐内容一律取真实口碑接口，不再内置假档口/菜品与假 subjectId）
const TIME_GREETING = {
    morning: '早上好呀！AI 暂时不可用，福宝先给你看看大家口碑最好的几家：',
    noon: '午市到啦！AI 暂时不可用，先看看当前口碑榜上的高分档口：',
    afternoon: '下午茶时间！AI 暂时不可用，先看看同学常点的选择：',
    evening: '晚饭时间！AI 暂时不可用，先看看今天的高分档口：',
    night: '夜宵时段！AI 暂时不可用，先看看人气档口：',
};

/* ================= 模型设置（保留原有：多模型列表 + 添加/编辑表单） ================= */
const cfg_open = ref(false);
/** 输入条模型快切面板可见性（展开时 @show 重拉列表保新鲜） */
const picker_open = ref(false);
const ai_saving = ref(false);
/** 连通性测试（r89）：testing_id = 正在测的已保存模型 id；testing_form = 表单测试中；test_result = 最近一次结果 */
const testing_id = ref(0);
const testing_form = ref(false);
const test_result = ref(null);
/** 已添加模型列表（含 isSelected 标记）与表单态：null 列表态 / 'pick' 选供应商 / 'add' / 'edit' */
const models = ref([]);
/** 平台托管模型（后台配置官方提供，免密钥直接选用；selected=使用中标记） */
const platform = ref([]);
const mode = ref(null);
/** 表单：provider/protocol 联动，modelId/displayName/apiKey 一律手填 */
const form = ref({ id: null, provider: 'openai', protocol: 'openai', baseUrl: '', modelId: '', displayName: '', apiKey: '' });
/** 编辑态的密钥掩码提示（留空保留原值） */
const edit_mask = ref('');
// 供应商注册表（启用项）：后台可维护，含协议类型/默认端点/控制台与模型文档链接
const providers = ref([]);

/** 是否已有使用中的模型（平台托管或自配任一） */
const ai_ready = computed(() => models.value.some((m) => m.isSelected) || platform.value.some((p) => p.selected));

/** 使用中模型的展示名（平台托管优先，其次自配展示名称/模型 ID） */
const selected_name = computed(() => {
    const ps = platform.value.find((p) => p.selected);
    if (ps) return ps.name;
    const sel = models.value.find((m) => m.isSelected);
    return sel ? (sel.displayName || sel.modelId) : '';
});

/** 当前表单选中供应商的注册表项（可能已被后台下架 → undefined） */
const cur_provider = computed(() => providers.value.find((p) => p.providerKey === form.value.provider));

/** 供应商标识 → 显示名（列表行展示用） */
function provider_name(key) {
    const p = providers.value.find((x) => x.providerKey === key);
    return p ? p.name : key;
}

/**
 * 拉取供应商注册表（后台新增即刻可见）
 */
async function load_providers() {
    try { providers.value = await api_ai.providers() || []; } catch { /* 拦截器已提示 */ }
}

/**
 * 拉取模型列表（打开快切面板时刷新）：自配 list + 平台托管 platform
 */
async function load_models() {
    try {
        const d = await api_ai.models();
        models.value = (d && d.list) || [];
        platform.value = (d && d.platform) || [];
    } catch { /* 拦截器已提示 */ }
}

/**
 * 选用平台托管模型（免密钥一键切换，成功后刷新列表状态）
 * @param {{id:number, name:string}} p - 平台模型项
 */
async function use_platform(p) {
    try {
        await api_ai.select_platform(p.id);
        await load_models();
        ElMessage.success(`已切换为 ${p.name}`);
    } catch { /* 拦截器已提示 */ }
}

/**
 * 从供应商选择列表进入添加表单：接口类型与官方地址随供应商自动带出（均可改）
 * @param {{providerKey:string, protocol:string, baseUrl:string}} p - 注册表项
 */
function start_form(p) {
    mode.value = 'add';
    test_result.value = null;
    form.value = {
        id: null, provider: p.providerKey, protocol: p.protocol,
        baseUrl: p.baseUrl || '', modelId: '', displayName: '', apiKey: '',
    };
    edit_mask.value = '';
}

/**
 * 进入编辑态：回显配置（密钥仅掩码占位，输入新值才覆盖）
 * @param {{id:number, provider:string, protocol:string, baseUrl:string, modelId:string, displayName:string, apiKeyMasked:string}} m
 */
function start_edit(m) {
    mode.value = 'edit';
    test_result.value = null;
    form.value = {
        id: m.id, provider: m.provider, protocol: m.protocol,
        baseUrl: m.baseUrl, modelId: m.modelId, displayName: m.displayName, apiKey: '',
    };
    edit_mask.value = m.apiKeyMasked || '';
}

/**
 * 保存表单（新增/编辑二合一；编辑态 apiKey 留空 = 保留原密钥），成功回到列表态
 */
async function save_model() {
    ai_saving.value = true;
    try {
        const payload = {
            provider: form.value.provider, protocol: form.value.protocol,
            baseUrl: form.value.baseUrl.trim(), modelId: form.value.modelId.trim(),
            displayName: form.value.displayName.trim(),
        };
        // 仅输入了新密钥才携带 apiKey 字段
        if (form.value.apiKey) payload.apiKey = form.value.apiKey.trim();
        const editing = mode.value === 'edit';
        const res = editing
            ? await api_ai.update_model(form.value.id, payload)
            : await api_ai.add_model(payload);
        if (editing) ElMessage.success('模型配置已保存');
        // r89：首个配置后端会自动置为使用中，其余配置需手动点「使用」，提示口径区分开
        else ElMessage.success(res && res.isSelected ? '模型已添加，并自动切换为使用中' : '模型已添加，点「使用」后生效');
        mode.value = null;
        test_result.value = null;
        await load_models();
    } catch { /* 拦截器已提示 */ } finally {
        ai_saving.value = false;
    }
}

/**
 * 取消添加/编辑：回到列表态并清掉上一次测试结果
 */
function cancel_form() {
    mode.value = null;
    test_result.value = null;
}

/**
 * 组装「测试连接」结果（成功给延迟，失败给中文原因 + 原始错误片段）
 * @param {{ok:boolean, latencyMs?:number, model?:string, hint?:string, error?:string}} r - 后端返回
 * @returns {Object} 视图用结果对象
 */
function shape_test_result(r) {
    return {
        ok: !!r.ok,
        latencyMs: r.latencyMs || 0,
        model: r.model || '',
        hint: r.hint || '',
        error: r.error || '',
    };
}

/**
 * 测试已保存的模型配置（复用服务端密文，无需重填密钥）
 * @param {{id:number, displayName:string, modelId:string}} m
 */
async function test_saved(m) {
    if (testing_id.value) return;
    testing_id.value = m.id;
    try {
        const r = await api_ai.test_model({ id: m.id });
        test_result.value = shape_test_result(r || { ok: false, hint: '未收到测试结果' });
        if (test_result.value.ok) {
            ElMessage.success(`「${m.displayName || m.modelId}」连接成功（${test_result.value.latencyMs}ms）`);
        } else {
            ElMessage.warning(test_result.value.hint || '连接失败，请检查配置');
        }
    } catch (e) {
        // 参数校验失败等业务错误：拦截器已提示，这里同步写进结果块便于对照
        test_result.value = {
            ok: false, latencyMs: 0, model: m.modelId, error: '',
            hint: (e && (e.msg || e.response?.data?.msg || e.message)) || '测试请求未完成，请稍后重试',
        };
    } finally {
        testing_id.value = 0;
    }
}

/**
 * 测试当前表单（不保存）：编辑态密钥留空时后端自动复用已保存密文
 */
async function test_form() {
    if (testing_form.value) return;
    const f = form.value;
    const editing = mode.value === 'edit' && !!f.id;
    if (!f.apiKey && !editing) {
        test_result.value = { ok: false, latencyMs: 0, model: '', error: '', hint: '请先填写 API Key 再测试' };
        ElMessage.warning('请先填写 API Key 再测试');
        return;
    }
    const payload = {
        provider: f.provider, protocol: f.protocol,
        baseUrl: (f.baseUrl || '').trim(), modelId: (f.modelId || '').trim(),
    };
    if (editing) payload.id = f.id;
    if (f.apiKey) payload.apiKey = f.apiKey.trim();
    testing_form.value = true;
    try {
        const r = await api_ai.test_model(payload);
        test_result.value = shape_test_result(r || { ok: false, hint: '未收到测试结果' });
        if (test_result.value.ok) {
            ElMessage.success(`连接成功（${test_result.value.latencyMs}ms），可以保存启用`);
        } else {
            ElMessage.warning(test_result.value.hint || '连接失败，请检查配置');
        }
    } catch (e) {
        test_result.value = {
            ok: false, latencyMs: 0, model: payload.modelId, error: '',
            hint: (e && (e.msg || e.response?.data?.msg || e.message)) || '测试请求未完成，请稍后重试',
        };
    } finally {
        testing_form.value = false;
    }
}

/**
 * 切换使用中的模型（ask 链路即刻按新配置生效）
 * @param {{id:number}} m
 */
async function use_model(m) {
    try {
        await api_ai.select_model(m.id);
        await load_models();
        ElMessage.success(`已切换使用「${m.displayName || m.modelId}」`);
    } catch { /* 拦截器已提示 */ }
}

/**
 * 删除模型配置（确认弹窗；删使用中项后端自动回落剩余最新一条）
 * @param {{id:number, displayName:string, modelId:string}} m
 */
async function remove_model(m) {
    try {
        await ElMessageBox.confirm(
            `确定删除「${m.displayName || m.modelId}」吗？删除后该配置的密钥同步失效。`,
            '删除模型', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        );
    } catch { return; /* 取消 */ }
    try {
        await api_ai.delete_model(m.id);
        await load_models();
        ElMessage.success('已删除');
    } catch { /* 拦截器已提示 */ }
}

/**
 * 打开模型设置弹窗（每次打开重拉注册表与列表；一个模型都没有时自动进入供应商选择态）
 */
async function open_cfg() {
    cfg_open.value = true;
    test_result.value = null;
    // 每次打开重拉「我的模型 + 平台模型」与供应商注册表（后台改动即刻可见）
    await Promise.all([load_models(), load_providers()]);
    if (!models.value.length && !mode.value) mode.value = 'pick';
}

/* ================= 历史对话管理（查看回显 / 单条删除 / 清空 / 新对话） ================= */

/** 历史对话抽屉开关 */
const hist_open = ref(false);
/** 历史问答列表（抽屉内展示，最近 20 条） */
const hist_list = ref([]);

/**
 * 打开历史对话抽屉并刷新列表
 */
async function open_history() {
    hist_open.value = true;
    try { hist_list.value = await api_ai.history() || []; } catch { hist_list.value = []; }
}

/**
 * 查看某轮历史：聊天区切换为该轮问答（含当时的推荐卡），并关闭抽屉
 * @param {{question: string, answer: string, recommendations: Array}} h
 */
function view_history(h) {
    messages.value = [
        { id: ++msg_seq, role: 'user', text: h.question },
        { id: ++msg_seq, role: 'ai', text: h.answer, recs: h.recommendations || [] },
    ];
    hist_open.value = false;
    nextTick(scroll_bottom);
}

/**
 * 开始新对话：清空聊天区只留欢迎语（历史记录不受影响）
 */
function new_chat() {
    messages.value = [
        { id: ++msg_seq, role: 'ai', text: '我是福宝，你的干饭小向导！今天想吃点什么？也可以点下面的快捷词～' },
    ];
    hist_open.value = false;
}

/**
 * 删除单条历史记录（确认后调接口，成功后同步移出抽屉列表）
 * @param {{id: number}} h
 */
async function del_history(h) {
    try {
        await ElMessageBox.confirm('删除这条对话记录？删除后不可恢复。', '删除记录', {
            type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
        });
    } catch { return; /* 用户取消 */ }
    await api_ai.delete_history(h.id);
    hist_list.value = hist_list.value.filter((x) => x.id !== h.id);
    ElMessage.success('已删除');
}

/**
 * 清空全部历史记录（确认后调接口，聊天区一并重置为欢迎语）
 */
async function clear_all() {
    try {
        await ElMessageBox.confirm('清空全部历史对话？删除后不可恢复。', '清空记录', {
            type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消',
        });
    } catch { return; /* 用户取消 */ }
    await api_ai.clear_history();
    hist_list.value = [];
    new_chat();
    ElMessage.success('已清空');
}

/* ================= 智能推荐对话（保留 api_ai.ask / history 接线） ================= */

/**
 * 「智能推荐」入口卡：平滑滚动到对话区并聚焦输入框
 */
function go_chat_anchor() {
    const el = document.getElementById('ai-chat');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 登录态聚焦输入框，引导直接提问
    if (auth.is_login) {
        nextTick(() => {
            if (ask_input.value) ask_input.value.focus();
        });
    }
}

/**
 * 对话流滚动到底部（页面流对话：直接滚窗口，输入条固定悬浮不受影响）
 */
function scroll_bottom() {
    nextTick(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    });
}

/**
 * 推荐卡跳转：subjectType 0 菜品 / 1 窗口 / 2 食区（沿用后端口径）
 * @param {{subjectType:number, subjectId:number}} r
 */
function go_rec(r) {
    const path = [`/dish/${r.subjectId}`, `/station/${r.subjectId}`, `/canteen/${r.subjectId}`][r.subjectType];
    if (path) router.push(path);
}

/**
 * 「在地图上查看」：跳地图页并定位该菜品/档口所属餐厅
 * @param {{canteenId?:number}} r
 */
function go_map(r) {
    if (!r.canteenId) {
        ElMessage.warning('该条推荐暂无定位信息，换一条试试');
        return;
    }
    router.push(`/map?focus=${r.canteenId}`);
}

/**
 * 去登录（带回跳）
 */
function go_login() {
    router.push({ path: '/login', query: { redirect: '/ai' } });
}

/**
 * 快捷提问：填入并立即发送
 * @param {string} q
 */
function quick_ask(q) {
    if (!auth.is_login || sending.value) return;
    draft.value = q;
    do_ask();
}

/**
 * 输入框 Enter 发送守卫：Enter=发送、Shift+Enter=换行；
 * 中文输入法组词确认的 Enter（isComposing）不触发发送，避免误发
 */
function on_ask_keydown(e) {
    if (e.isComposing) return;
    e.preventDefault();
    do_ask();
}

/**
 * 降级推荐：按时段给问候语 + 拉真实口碑榜（/recommendations top）作为推荐卡；
 * 接口不可用时仅返回问候语，不编造任何档口/菜品
 * @returns {Promise<{text: string, recs: Array}>}
 */
async function fallback_reply() {
    const h = new Date().getHours();
    const text = h < 10 ? TIME_GREETING.morning
        : h < 14 ? TIME_GREETING.noon
            : h < 17 ? TIME_GREETING.afternoon
                : h < 21 ? TIME_GREETING.evening
                    : TIME_GREETING.night;
    let recs = [];
    try {
        const d = await api_content.recommendations();
        recs = (d?.top || []).slice(0, 3).map((r) => ({
            name: r.name,
            station_name: r.subtitle,
            reason: r.reviewCount ? `均分 ${Number(r.avgScore).toFixed(1)} · ${r.reviewCount} 条评价` : '口碑推荐',
            img: img_url(r.cover),
            subjectType: r.subjectType,
            subjectId: r.subjectId,
        }));
    } catch { /* 口碑接口不可用：仅保留问候语 */ }
    return { text, recs };
}

/**
 * 发送提问：追加双方气泡，回答携带推荐卡；
 * 接口失败时降级为按时段规则化推荐并打开降级提示（AC24）
 */
async function do_ask() {
    const question = draft.value.trim();
    if (!question || sending.value) return;
    draft.value = '';
    messages.value.push({ id: ++msg_seq, role: 'user', text: question });
    scroll_bottom();
    sending.value = true;
    try {
        const data = await api_ai.ask(question);
        degraded.value = !!data.degraded;
        // r89：把后端的中文降级原因（密钥无效 / 404 / 超时 / 网络不可达）带回提示条
        degraded_reason.value = (data && data.degradedReason) || '';
        messages.value.push({
            id: ++msg_seq, role: 'ai',
            text: data.answer || '（福宝没答上来，换个问法试试？）',
            recs: data.recommendations || [],
        });
    } catch {
        // AI 接口不可用 → 切换为按时段规则化热门推荐，并明确提示已降级
        degraded.value = true;
        degraded_reason.value = '请求未完成：请检查网络，或到「模型设置」点「测试」确认配置可用';
        const fb = await fallback_reply();
        messages.value.push({ id: ++msg_seq, role: 'ai', text: fb.text, recs: fb.recs });
        ElMessage.warning('AI 暂不可用，已为你切换为热门推荐');
    } finally {
        sending.value = false;
        scroll_bottom();
    }
}

/* ================= 会话缓存（keep-alive 激活/失活 + 滚动位置记忆） ================= */

/** 滚动位置缓存键（sessionStorage：同标签页返回生效，刷新后由历史重建兜底） */
const AI_SCROLL_KEY = 'fk_ai_scroll_y';
/** 会话归属用户 id：keep-alive 缓存跨页面存活，切换账号时需重置会话重新回显 */
let session_uid = 0;

/**
 * 首次进入 / 切换账号后的会话引导：对话区默认为空，仅一条欢迎语引导用户提问
 * （历史对话不再整段平铺，统一收进「历史对话」抽屉按需查看）
 */
async function boot_session() {
    if (!auth.is_login) return;
    load_models();
    messages.value.push({ id: ++msg_seq, role: 'ai', text: '我是福宝，你的干饭小向导！今天想吃点什么？也可以点下面的快捷词～' });
    scroll_bottom();
}

/**
 * 恢复离开时的滚动位置（跳详情后返回 / 同标签页切回）
 */
function restore_scroll() {
    const raw = sessionStorage.getItem(AI_SCROLL_KEY);
    sessionStorage.removeItem(AI_SCROLL_KEY);
    if (raw === null) return false;
    const y = Number(raw);
    if (Number.isNaN(y) || y < 0) return false;
    // 等渲染稳定后再恢复（transition + 图片高度抖动，双帧保证 clamp 到有效位置）
    nextTick(() => {
        requestAnimationFrame(() => {
            window.scrollTo({ top: y, behavior: 'auto' });
        });
    });
    return true;
}

/**
 * 每次激活（首次进入 / 从详情页等返回）：同账号恢复现场，换账号重置重建
 */
onActivated(() => {
    const uid = auth.is_login ? auth.user.id : 0;
    if (uid !== session_uid) {
        // 首次进入或账号切换：重置会话，仅欢迎语引导（历史收进抽屉）
        session_uid = uid;
        messages.value = [];
        msg_seq = 0;
        degraded.value = false;
        degraded_reason.value = '';
        // 带着已保存位置进入时，先引导再恢复位置（覆盖 boot 的滚底）
        const has_saved = sessionStorage.getItem(AI_SCROLL_KEY) !== null;
        boot_session().then(() => { if (has_saved) restore_scroll(); });
    } else {
        // 同账号返回：对话/草稿/发送态由 keep-alive 保留，仅刷新模型状态并恢复阅读位置
        load_models();
        restore_scroll();
    }
});

/** 失活（跳去详情/其他页）：记录当前滚动位置 */
onDeactivated(() => {
    sessionStorage.setItem(AI_SCROLL_KEY, String(window.scrollY));
});

/** 页面刷新兜底：刷新会丢 keep-alive 状态，位置先记下（历史重建后可恢复） */
const save_scroll = () => { sessionStorage.setItem(AI_SCROLL_KEY, String(window.scrollY)); };
window.addEventListener('beforeunload', save_scroll);
onUnmounted(() => window.removeEventListener('beforeunload', save_scroll));
</script>

<style scoped>
/* AI 助手主页：480px 手机列（page-wrap），暖纸奶油风；
   底部预留固定输入条 + tabbar 的高度，避免末尾内容被悬浮层盖住 */
.ai-page { padding-bottom: 168px; }

/* ===== 功能入口卡：通栏大卡 + 2×2 网格 ===== */
.entry-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.entry {
    display: flex; align-items: center; gap: 10px;
    padding: 14px; cursor: pointer; text-decoration: none; color: inherit;
    transition: background .12s ease;
}
.entry:hover { background: #FBF3DC; }
.entry.wide { grid-column: 1 / -1; }
.entry .ill { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; }
.entry .et { min-width: 0; }
.entry .et b { display: block; font-size: 13.5px; font-weight: 700; }
.entry .et span { display: block; font-size: 10.5px; color: var(--ink-2); margin-top: 3px; font-weight: 400; }
.entry .arr { margin-left: auto; width: 16px; height: 16px; color: var(--ink-2); flex-shrink: 0; }

/* ===== 降级提示：淡黄纸条（AC24） ===== */
.degrade-tip {
    background: #FBF0D8; border: 1px dashed var(--line); border-radius: var(--radius-sm);
    color: #a06a10; font-size: 12px; padding: 8px 12px; margin-bottom: 10px;
}
/* 降级原因（r89）：换行小字，避免与主提示挤在一行 */
.degrade-why { display: block; margin-top: 2px; font-size: 11px; color: #a06a10; opacity: .85; }

/* ===== 对话流：页面流排布（原型 P16 同款，随页面滚动不做内滚动） ===== */
/* 区块标题间距微调：入口卡与对话区之间收紧一档，快捷词紧随其后 */
#ai-chat.sec { padding-top: 24px; padding-bottom: 10px; }
/* ===== 会话头：福宝身份 + 新对话/历史对话/模型设置 ===== */
.chat-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.head-id { display: flex; align-items: center; gap: 9px; min-width: 0; }
.head-face { width: 34px; height: 34px; object-fit: contain; flex-shrink: 0; }
.head-name { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
.head-name b { font-size: 13.5px; color: var(--ink); }
.head-name span { font-size: 11px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 操作钮组：淡金底实体按钮（新对话/历史对话 + 模型设置图标钮） */
.head-ops { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.head-btn {
    display: inline-flex; align-items: center; gap: 5px;
    border: none; cursor: pointer; font-family: inherit;
    background: var(--brand-light); color: var(--ink-3);
    font-size: 12px; font-weight: 700;
    padding: 7px 12px; border-radius: var(--radius-sm);
    transition: background .12s ease, color .12s ease;
}
.head-btn:hover { background: #f0dcae; color: var(--brand-dark); }
.head-btn.icon-only { padding: 7px 9px; }
.chat-card { padding: 18px; margin-top: 12px; }
.msg { display: flex; gap: 10px; margin-bottom: 16px; align-items: flex-start; }
.msg.user { flex-direction: row-reverse; }
/* 福宝头像：圆形 + 宇航员插画（正圆仅头像，符合规范） */
.ai-face {
    width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
    background: var(--brand-light); overflow: hidden;
    display: flex; align-items: center; justify-content: center;
}
.ai-face img { width: 24px; height: 24px; object-fit: contain; }
/* 气泡：无框卡 + 极淡弥散阴影；用户气泡墨色实底（去墨线描边） */
.chat-bub { max-width: 82%; border-radius: var(--radius-sm); padding: 10px 13px; }
.msg.ai .chat-bub { background: var(--paper); box-shadow: var(--shadow-soft); }
.msg.user .chat-bub { background: var(--ink); color: var(--paper); }
.chat-bub .text { margin: 0; font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; font-weight: 400; }
.thinking { color: var(--ink-2); }
/* 推荐小卡：淡纸底行卡 + 推荐理由签 */
.recs { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.rec-card {
    display: flex; align-items: center; gap: 9px;
    background: var(--page); border-radius: var(--radius-sm);
    padding: 8px 9px; cursor: pointer; transition: background .12s ease;
}
.rec-card:hover { background: var(--brand-light); }
.rec-img { width: 44px; height: 44px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; font-size: 16px; }
.rec-main { flex: 1; min-width: 0; }
.rec-name { display: block; font-size: 13px; font-weight: 700; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rec-sub { display: block; font-size: 10.5px; color: var(--ink-2); margin-top: 1px; font-weight: 400; }
.rec-reason { display: block; font-size: 10px; color: var(--ink-3); margin-top: 3px; font-weight: 400; }
.rec-ico {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: var(--radius-sm); cursor: pointer; flex-shrink: 0;
    border: 1px solid var(--line); background: var(--paper); color: var(--ink-3);
    transition: background .12s ease, color .12s ease; touch-action: manipulation; padding: 0; font: inherit;
}
.rec-ico:hover { background: var(--brand-light); color: var(--brand-dark); }
/* 未登录引导 */
.login-guide { text-align: center; padding: 46px 0 40px; color: var(--ink-2); }
.guide-pet { width: 72px; height: 72px; object-fit: contain; margin: 0 auto 10px; }
.login-guide p { margin: 0 0 14px; font-size: 13px; }
.go-login { min-width: 120px; }

/* ===== 快捷提问 chips ===== */
.quick { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 0; }
.quick span {
    font-size: 11px; background: var(--paper); border: 1px solid var(--line);
    color: var(--ink-3); padding: 5px 12px; border-radius: var(--radius-sm);
    font-weight: 600; cursor: pointer; transition: background .12s ease;
}
.quick span:hover { background: var(--brand-light); }

/* ===== 底部输入区（两行式）：固定悬浮于 tabbar 上方，与手机列等宽居中（原型 .inputbar 同款） ===== */
.input-bar {
    position: fixed; bottom: calc(72px + env(safe-area-inset-bottom));
    left: 50%; transform: translateX(-50%);
    width: 480px; max-width: calc(100% - 20px);
    z-index: 150;
    display: flex; flex-direction: column; gap: 8px;
}
.ask-input :deep(.el-textarea__inner) { scrollbar-width: none; -ms-overflow-style: none; }
.ask-input :deep(.el-textarea__inner::-webkit-scrollbar) { display: none; }
.input-ops { display: flex; align-items: center; gap: 10px; }
.input-ops .send-btn { margin-left: auto; }
/* 模型快切 chip：微圆角（去胶囊） */
.model-chip {
    display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
    max-width: 180px; height: 32px; padding: 0 12px;
    border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--paper);
    font-size: 12px; color: var(--ink); cursor: pointer; font-weight: 600;
    transition: background .12s ease;
}
.model-chip .chip-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.model-chip .chip-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-2); flex-shrink: 0; }
.model-chip.on .chip-dot { background: var(--brand); }
.model-chip:hover { background: var(--brand-light); }

/* ===== 合规声明（AC24） ===== */
.compliance { text-align: center; font-size: 10.5px; color: var(--ink-2); margin: 24px 0 8px; line-height: 1.7; }

/* ===== 模型设置弹窗（保留功能，样式对齐暖纸风） ===== */
.cfg-state {
    display: inline-block; font-size: 11px; padding: 2px 10px; border-radius: 6px;
    border: 1px solid var(--line); background: var(--paper); color: var(--ink-2); margin-bottom: 8px;
}
.cfg-state.on { background: var(--brand-light); color: var(--ink-3); font-weight: 700; }
.cfg-tip {
    background: var(--paper); border: 1px dashed var(--line); border-radius: var(--radius-sm);
    padding: 9px 12px; margin: 10px 0 14px; font-size: 12px; color: var(--ink-2); line-height: 1.7; font-weight: 400;
}
/* 连通性测试结果块（r89）：成功淡绿 / 失败淡红，失败附排查建议与原始错误片段 */
.test-box {
    display: flex; flex-direction: column; gap: 2px;
    border: 1px solid var(--line); border-radius: var(--radius-sm);
    padding: 8px 12px; margin: -4px 0 12px; font-size: 12px; line-height: 1.6; font-weight: 400;
}
.test-box.ok { background: #EDF6E9; border-color: #cfe4c4; color: #3d6b32; }
.test-box.bad { background: #FBEDEB; border-color: #f0d3cd; color: #a63b2d; }
/* 表单态结果块（r89）：与表单留一点间距 */
.test-box.form { margin: 8px 0 0; }
.tb-title { font-size: 12px; font-weight: 700; }
.tb-main { font-size: 12px; }
.tb-err { font-size: 11px; opacity: .8; word-break: break-all; }
/* 表单内测试入口说明（r89） */
.form-test-tip { margin-left: 8px; font-size: 11px; color: var(--ink-2); font-weight: 400; }
.cfg-ops { display: flex; justify-content: flex-end; gap: 8px; }
/* 已添加模型列表：无框行卡 + 使用中琥珀签 */
.model-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.model-item {
    display: flex; align-items: center; gap: 8px;
    background: var(--page); border-radius: var(--radius-sm); padding: 8px 10px;
}
.model-item.sel { background: var(--brand-light); }
.mi-main { flex: 1; min-width: 0; cursor: pointer; }
.model-item.sel .mi-main { cursor: default; }
.mi-name { display: block; font-size: 13px; font-weight: 700; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mi-meta { display: block; font-size: 11px; color: var(--ink-2); margin-top: 1px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mi-proto {
    display: inline-block; font-style: normal; font-size: 10px; line-height: 14px;
    padding: 0 5px; border-radius: 6px; vertical-align: 1px;
    background: var(--brand-light); color: var(--brand-dark); font-weight: 700;
}
.mi-proto.ant { background: #e3eefa; color: #2b5d9e; }
.mi-using {
    flex-shrink: 0; font-size: 11px; font-weight: 700; line-height: 18px;
    padding: 0 8px; border-radius: 6px; background: var(--brand); color: #FFFDF5;
}
.mi-use {
    flex-shrink: 0; font-size: 11px; font-weight: 600; line-height: 18px; cursor: pointer;
    padding: 0 8px; border-radius: 6px; border: 1px dashed var(--line); color: var(--ink-2); background: var(--paper);
}
.mi-use:hover { color: var(--brand-dark); border-color: var(--brand); background: #FBF3DC; }
/* 已保存配置的测试钮（r89）：与「使用」同尺寸的描边小签 */
.mi-test {
    flex-shrink: 0; font-size: 11px; font-weight: 600; line-height: 18px; cursor: pointer;
    padding: 0 8px; border-radius: 6px; border: 1px solid var(--line); color: var(--ink-2); background: var(--page);
}
.mi-test:hover { color: var(--brand-dark); border-color: var(--brand); }
.mi-test.busy { opacity: .6; cursor: progress; }
.mi-op { flex-shrink: 0; color: var(--ink-2); cursor: pointer; }
.mi-op:hover { color: var(--brand-dark); }
.mi-op.danger:hover { color: var(--bad); }
/* 表单分区：虚线上边 */
.form-sep { border-top: 1px dashed var(--line); padding-top: 12px; margin-top: 2px; }
.add-model-btn { border-style: dashed; width: 100%; }
/* 供应商选择列表：两列网格 */
.prov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.prov-item {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    padding: 10px 12px; cursor: pointer; text-align: left;
    background: var(--page); border: 1px solid var(--line); border-radius: var(--radius-sm);
    font: inherit; transition: background .12s ease;
}
.prov-item:hover { background: #FBF3DC; }
.prov-name { font-size: 13px; font-weight: 700; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prov-arrow { flex-shrink: 0; color: var(--ink-2); font-size: 15px; line-height: 1; }
.prov-fixed { font-size: 13px; font-weight: 700; color: var(--ink); }
.prov-repick {
    margin-left: 8px; padding: 3px 12px; font-size: 12px; font-weight: 600;
    border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--paper);
    color: var(--ink); cursor: pointer; font: inherit;
}
.prov-repick:hover { background: var(--brand-light); color: var(--brand-dark); }
/* 官方文档链接区 */
.doc-links {
    margin-top: 2px; padding-top: 10px; font-size: 12px;
    border-top: 1px dashed var(--line); display: flex; align-items: center; gap: 10px;
}
.doc-label { color: var(--ink-2); }
.doc-link { color: var(--brand-dark); font-weight: 600; text-decoration: none; border-bottom: 1px dashed var(--brand-dark); }
.doc-link:hover { color: var(--brand); border-bottom-color: var(--brand); }
/* 快切面板（teleported=false 留在组件树内，scoped 生效）：卡面 + 极淡阴影 */
.ai-page :deep(.model-picker) {
    padding: 14px 14px 10px !important;
    background: var(--paper);
    border: 1px solid var(--line) !important;
    border-radius: var(--radius) !important;
    box-shadow: 0 8px 40px rgba(140, 110, 60, 0.12) !important;
}
.mp-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed var(--line);
}
.mp-title { font-size: 13px; font-weight: 700; color: var(--ink); }
.mp-manage { font-size: 12px; color: var(--brand-dark); cursor: pointer; }
.mp-list { display: flex; flex-direction: column; gap: 6px; }
.mp-item {
    display: flex; align-items: center; gap: 8px; padding: 9px 10px;
    border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer;
}
.mp-item:hover { background: #FBF3DC; }
.mp-item.sel { border-color: var(--line); background: var(--brand-light); cursor: default; }
.mp-name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; color: var(--ink); }
.mp-using { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; flex-shrink: 0; background: var(--brand); color: #FFFDF5; }
.mp-del { color: var(--ink-2); flex-shrink: 0; font-size: 16px; }
.mp-del:hover { color: var(--bad); }
/* 快切面板测试钮（r89）：小号描边，避免与「使用中」琥珀签抢视线 */
.mp-test {
    flex-shrink: 0; font-size: 11px; font-weight: 600; line-height: 18px; cursor: pointer;
    padding: 0 7px; border-radius: 6px; border: 1px solid var(--line); background: var(--page); color: var(--ink-2);
}
.mp-test:hover { color: var(--brand-dark); border-color: var(--brand); }
.mp-test.busy { opacity: .6; cursor: progress; }
.mp-empty { font-size: 12px; color: var(--ink-2); padding: 10px 2px; }
/* 面板分组小标题（平台模型 / 我的模型） */
.mp-group { font-size: 11px; font-weight: 700; color: var(--ink-2); margin: 8px 2px 4px; letter-spacing: .5px; }
/* 模型设置弹窗分组标题（平台模型 / 我的模型） */
.cfg-group { font-size: 12px; font-weight: 700; color: var(--ink-2); margin: 14px 0 8px; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 对话流卡：桌面限宽 900 居中，长对话在宽幅下更易阅读 */
    .chat-card { max-width: 900px; margin-left: auto; margin-right: auto; width: 100%; }
    /* 快捷提问 chips：与内容列左对齐（跟随标题与卡片），间距与内边距放宽 */
    .quick { justify-content: flex-start; gap: 12px; }
    .quick span { padding: 6px 18px; font-size: 12px; }
    /* 降级提示条随对话区同宽居中 */
    .degrade-tip { max-width: 900px; margin-left: auto; margin-right: auto; }
    /* 消息气泡：桌面放宽到 70%，并封顶 560px 绝对宽度（min 同时约束两档） */
    .chat-bub { max-width: min(70%, 560px); }
    /* 底部悬浮输入条：与对话区同宽（900px），输入框加高更舒展 */
    .input-bar { width: 900px; max-width: calc(100% - 48px); }
    .ask-input :deep(.el-textarea__inner) { min-height: 56px; }
}

/* ===== 历史对话抽屉 ===== */
.hist-ops { display: flex; gap: 8px; margin-bottom: 14px; }
.hist-empty { text-align: center; color: var(--ink-2); font-size: 12.5px; padding: 40px 0; }
/* 单条记录：纸底卡行，悬停淡金提示可点查看 */
.hist-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    border-radius: var(--radius-sm);
    background: var(--page);
    margin-bottom: 10px;
    cursor: pointer;
    transition: background .12s ease;
}
.hist-item:hover { background: #FBF3DC; }
.hist-main { flex: 1; min-width: 0; }
.hist-q { margin: 0; font-size: 13px; font-weight: 700; color: var(--ink); line-height: 1.5; }
/* 回答摘要：最多两行截断 */
.hist-a {
    margin: 5px 0 0;
    font-size: 12px;
    color: var(--ink-2);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.hist-time { display: block; margin-top: 6px; font-size: 11px; color: var(--ink-2); }
/* 删除钮：淡色，悬停转红底 */
.hist-del {
    flex-shrink: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--ink-2);
    padding: 4px;
    border-radius: 6px;
    transition: color .12s ease, background .12s ease;
}
.hist-del:hover { color: var(--bad); background: #fdecec; }

/* ===== 桌面适配（≥1200）===== */
</style>
