# 启思 AI 学习助手

这是一个中小学生 AI 学习网站的可运行 MVP 原型，覆盖：

- 学生端：首次学习档案、年级学期选择、AI 问答、作业辅导、期中/期末复习
- 家长端：学习报告、薄弱知识点、对话摘要、内容举报、时长限制
- 管理端：年级学科配置、内容审核队列、安全日志
- DeepSeek 服务端接入：提示式回答、练习题生成、答题反馈和安全拦截

## 运行方式

### 本地 mock 模式

直接用浏览器打开 `index.html` 即可。此时不会调用服务端，也不会使用 DeepSeek API Key。

### DeepSeek 服务端模式

先配置环境变量：

```bash
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
npm.cmd run dev
```

然后打开：

```text
http://localhost:3000
```

服务端会提供静态页面和 `/api/*` 学习接口，浏览器只调用本地服务端，DeepSeek API Key 只保存在服务端环境变量中。

## 工程化改造进展

- `src/apiClient.js`：前端学习 API 客户端。HTTP 模式下调用 `/api`，文件直开时回退到本地 mock。
- `server/index.js`：无依赖 Node 服务端，提供静态文件和学习 API 路由。
- `server/deepseekClient.js`：DeepSeek OpenAI-compatible Chat Completions 客户端，使用 `response_format: { type: "json_object" }` 获取结构化输出。
- `server/learningService.js`：统一学习服务层，封装 DeepSeek 调用、本地安全预检、结构校验和 mock fallback。
- `src/stateRepository.js`：状态仓储层，统一封装 `localStorage` 读写和默认状态补齐。
- `src/auditLog.js`：审计日志入口，统一记录安全拦截、提示式回答和家长举报。
- `smoke-test.mjs`：覆盖 API 客户端、状态仓储、审计日志、DeepSeek 请求格式和学习服务。

## 服务端 API

前端调用：

- `POST /api/tutor-reply`
- `POST /api/practice`
- `POST /api/answer-feedback`
- `POST /api/review-quiz`
- `GET /api/health`

服务端调用 DeepSeek：

- `POST https://api.deepseek.com/chat/completions`
- Header：`Authorization: Bearer $DEEPSEEK_API_KEY`
- 默认模型：`deepseek-v4-flash`

## 后续工程化建议

- 将 `src/data.js` 中的知识点、题目、审计日志迁移到 PostgreSQL。
- 增加用户登录、家长绑定、权限控制和后台审核流。
- 增加题目抽检、纠错闭环、模型输出审计和合规模块。
- 为 DeepSeek 调用增加请求追踪 ID、限流、重试和成本统计。

