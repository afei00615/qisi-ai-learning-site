# 启思 AI 学习助手

面向中小学生的 AI 学习助手 MVP，围绕浙江地区常见学科提供解题引导、知识问答、作业练习、期中/期末复习、家长报告和内容审核能力。

## 当前能力

- 学生端：年级与学期档案、按学科新建和切换历史会话、按语文/数学/英语等学科采用差异化辅导策略、流式解题引导、知识问答、练习生成、练习记录和测验记录。
- 家长端：绑定学生、查看学习报告、设置每日学习时长、提交内容举报。
- 管理端：查看审核队列、通过、驳回或升级复核内容。
- AI 服务：由 Node.js 服务端调用 DeepSeek，API Key 不下发到浏览器。
- 数据存储：SQLite 按用户持久化档案、会话、消息、练习、报告、登录会话和审计事件。
- 权限控制：Bearer Token 会话认证，学生、家长和管理员权限由服务端校验。

## 技术结构

```text
浏览器
  ├─ src/authClient.js          登录、会话和权限业务请求
  ├─ src/apiClient.js           学习与流式问答 API
  └─ src/stateRepository.js     本地缓存与服务端状态同步
          │
          ▼
Node.js server/index.js
  ├─ server/authService.js      身份认证与角色校验
  ├─ server/learningService.js  学习业务与输出校验
  ├─ server/deepseekClient.js   DeepSeek 重试、usage 与成本估算
  ├─ server/rateLimiter.js       用户级模型请求限流
  ├─ server/observability/       请求追踪上下文
  └─ server/storage/            结构化 SQLite 与审计存储
```

存储入口统一为 `server/storage/stateStore.js`。业务层只依赖存储接口，后续可以增加 PostgreSQL adapter，保持前端和 HTTP API 基本不变。

## 本地运行

要求 Node.js 22.5 或更高版本，项目使用 Node 内置的 `node:sqlite`。

不配置 DeepSeek Key 时，服务端使用本地 mock，适合界面开发和自动测试：

```powershell
npm.cmd run dev
```

默认访问地址：

```text
http://localhost:3000
```

指定端口：

```powershell
$env:PORT="3100"
npm.cmd run dev
```

## 接入 DeepSeek

```powershell
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
npm.cmd run dev
```

可选环境变量：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 空 | DeepSeek 服务端密钥 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 模型名称 |
| `QISI_SQLITE_PATH` | `server/data/qisi.sqlite` | SQLite 文件路径 |
| `PORT` | `3000` | HTTP 服务端口 |
| `LLM_RATE_LIMIT_PER_MINUTE` | `20` | 每个用户每分钟允许的模型请求数 |
| `DEEPSEEK_MAX_RETRIES` | `2` | 429、网络错误和 5xx 的最大重试次数 |
| `DEEPSEEK_RETRY_BASE_MS` | `300` | 指数退避的基础毫秒数 |
| `DEEPSEEK_PRICE_INPUT_CACHE_HIT_PER_M` | 按模型 | 每百万缓存命中输入 token 的美元单价 |
| `DEEPSEEK_PRICE_INPUT_CACHE_MISS_PER_M` | 按模型 | 每百万缓存未命中输入 token 的美元单价 |
| `DEEPSEEK_PRICE_OUTPUT_PER_M` | 按模型 | 每百万输出 token 的美元单价 |

## 体验账号

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 学生 | `student` | `student123` |
| 家长 | `parent` | `parent123` |
| 管理员 | `admin` | `admin123` |

登录会话默认有效 7 天，密码使用 scrypt 加盐哈希保存。生产部署前必须删除或修改体验账号，并使用 HTTPS。

## 服务端 API

认证：

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

学习功能，要求学生或管理员身份：

- `POST /api/tutor-reply`
- `POST /api/tutor-reply/stream`
- `POST /api/practice`
- `POST /api/answer-feedback`
- `POST /api/review-quiz`

状态与家长功能：

- `GET /api/state`：已登录用户读取状态。
- `POST /api/state`：学生保存学习状态。
- `POST /api/parent/bind`：家长使用绑定码绑定学生。
- `POST /api/parent/settings`：已绑定家长设置学习时长。
- `POST /api/moderation/report`：已绑定家长提交举报。
- `POST /api/moderation/:id/review`：管理员处理审核项。
- `GET /api/admin/llm-usage?days=30`：管理员查看请求量、重试、token 和估算成本。
- `GET /api/health`：服务健康检查。

除登录和健康检查外，请求需携带：

```http
Authorization: Bearer <token>
```

## DeepSeek 可观测性

每个 HTTP 请求都会返回 `X-Request-Id`。模型请求按已登录用户限流，并将匿名化 `user_id` 传给 DeepSeek 做用户级隔离。可重试错误使用带抖动的指数退避；流式响应只会在尚未输出内容前重试，避免重复文本。

成本根据 DeepSeek 返回的 `usage` 估算。价格会变化，生产环境应通过价格环境变量覆盖默认值。模型审计不保存完整学生提示词，只保存输入哈希、最多 1000 字符的输出摘要和输出哈希。

## 数据存储

默认数据库文件为 `server/data/qisi.sqlite`，已通过 `.gitignore` 排除，不会提交到仓库。

当前 SQLite 表包括：

- `student_profiles`：按学生保存档案、年级、学期、时长和薄弱点。
- `conversation_sessions`、`conversation_messages`：按学生、模式和学科保存多条会话及消息。旧的 `chat_sessions`、`chat_messages` 仅用于迁移兼容。
- `practice_sets`、`practice_items`、`practice_attempts`：保存练习、题目和每次作答反馈。
- `learning_reports`、`review_runs`：保存学习报告和复习记录。
- `moderation_items`、`audit_events`：保存审核队列和审计事件。
- `llm_request_audits`：保存追踪 ID、模型、状态、重试次数、token、估算成本、输出摘要和哈希。
- `users`、`auth_sessions`、`parent_bindings`：保存认证和家长绑定关系。
- `schema_migrations`：数据库迁移版本。

旧的 `app_state` 表仅作为历史 JSON 快照的迁移来源。首次启动结构化存储时会自动拆分旧数据，之后不再写入全局快照。

## 检查与测试

```powershell
npm.cmd run check
npm.cmd run smoke
```

冒烟测试覆盖结构化状态迁移、多学生隔离、练习与作答持久化、账号密码校验、角色越权、DeepSeek 重试、限流、token 用量、成本统计和流式回复。

## 后续改造

- 增加注册、密码重置、会话撤销、登录限流和管理员账号管理。
- 增加 PostgreSQL 存储适配器及 SQLite 到 PostgreSQL 的迁移工具。
- 完善内容举报详情、审核操作记录和家长绑定确认流程。
