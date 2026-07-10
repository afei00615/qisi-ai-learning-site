# 启思 AI 学习助手

面向中小学生的 AI 学习助手 MVP，围绕浙江地区常见学科提供解题引导、知识问答、作业练习、期中/期末复习、家长报告和内容审核能力。

## 当前能力

- 学生端：年级与学期档案、按学科独立会话、流式解题引导、知识问答、练习生成和在线复习。
- 家长端：绑定学生、查看学习报告、设置每日学习时长、提交内容举报。
- 管理端：查看审核队列、通过、驳回或升级复核内容。
- AI 服务：由 Node.js 服务端调用 DeepSeek，API Key 不下发到浏览器。
- 数据存储：SQLite 持久化应用状态、用户、登录会话、家长绑定和审计事件。
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
  ├─ server/deepseekClient.js   DeepSeek 客户端
  └─ server/storage/            SQLite 存储适配层
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
- `GET /api/health`：服务健康检查。

除登录和健康检查外，请求需携带：

```http
Authorization: Bearer <token>
```

## 数据存储

默认数据库文件为 `server/data/qisi.sqlite`，已通过 `.gitignore` 排除，不会提交到仓库。

当前 SQLite 表包括：

- `app_state`：应用学习状态快照。
- `audit_events`：审计事件。
- `users`：用户和密码哈希。
- `auth_sessions`：登录会话。
- `parent_bindings`：家长与学生绑定关系。
- `schema_migrations`：数据库迁移版本。

## 检查与测试

```powershell
npm.cmd run check
npm.cmd run smoke
```

冒烟测试覆盖状态持久化、账号密码校验、会话认证、角色越权、家长绑定、DeepSeek 请求格式和流式回复。

## 后续改造

- 将全局应用状态拆成按用户、会话、消息、练习和报告组织的结构化表。
- 增加注册、密码重置、会话撤销、登录限流和管理员账号管理。
- 增加 PostgreSQL 存储适配器及 SQLite 到 PostgreSQL 的迁移工具。
- 为 DeepSeek 请求增加追踪 ID、重试、限流、成本统计和模型输出审计。
- 完善内容举报详情、审核操作记录和家长绑定确认流程。
