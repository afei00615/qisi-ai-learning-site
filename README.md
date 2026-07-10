# 鍚€?AI 瀛︿範鍔╂墜

杩欐槸涓€涓腑灏忓鐢?AI 瀛︿範缃戠珯鐨勫彲杩愯 MVP 鍘熷瀷锛岃鐩栵細

- 瀛︾敓绔細棣栨瀛︿範妗ｆ銆佸勾绾у鏈熼€夋嫨銆丄I 闂瓟銆佷綔涓氳緟瀵笺€佹湡涓?鏈熸湯澶嶄範
- 瀹堕暱绔細瀛︿範鎶ュ憡銆佽杽寮辩煡璇嗙偣銆佸璇濇憳瑕併€佸唴瀹逛妇鎶ャ€佹椂闀块檺鍒?- 绠＄悊绔細骞寸骇瀛︾閰嶇疆銆佸唴瀹瑰鏍搁槦鍒椼€佸畨鍏ㄦ棩蹇?- DeepSeek 鏈嶅姟绔帴鍏ワ細鎻愮ず寮忓洖绛斻€佺粌涔犻鐢熸垚銆佺瓟棰樺弽棣堝拰瀹夊叏鎷︽埅

## 杩愯鏂瑰紡

### 鏈湴 mock 妯″紡

鐩存帴鐢ㄦ祻瑙堝櫒鎵撳紑 `index.html` 鍗冲彲銆傛鏃朵笉浼氳皟鐢ㄦ湇鍔＄锛屼篃涓嶄細浣跨敤 DeepSeek API Key銆?
### DeepSeek 鏈嶅姟绔ā寮?
鍏堥厤缃幆澧冨彉閲忥細

```bash
$env:DEEPSEEK_API_KEY="浣犵殑 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
npm.cmd run dev
```

鐒跺悗鎵撳紑锛?
```text
http://localhost:3000
```

鏈嶅姟绔細鎻愪緵闈欐€侀〉闈㈠拰 `/api/*` 瀛︿範鎺ュ彛锛屾祻瑙堝櫒鍙皟鐢ㄦ湰鍦版湇鍔＄锛孌eepSeek API Key 鍙繚瀛樺湪鏈嶅姟绔幆澧冨彉閲忎腑銆?
## 宸ョ▼鍖栨敼閫犺繘灞?
- `src/apiClient.js`锛氬墠绔涔?API 瀹㈡埛绔€侶TTP 妯″紡涓嬭皟鐢?`/api`锛屾枃浠剁洿寮€鏃跺洖閫€鍒版湰鍦?mock銆?- `server/index.js`锛氭棤渚濊禆 Node 鏈嶅姟绔紝鎻愪緵闈欐€佹枃浠跺拰瀛︿範 API 璺敱銆?- `server/deepseekClient.js`锛欴eepSeek OpenAI-compatible Chat Completions 瀹㈡埛绔紝浣跨敤 `response_format: { type: "json_object" }` 鑾峰彇缁撴瀯鍖栬緭鍑恒€?- `server/learningService.js`锛氱粺涓€瀛︿範鏈嶅姟灞傦紝灏佽 DeepSeek 璋冪敤銆佹湰鍦板畨鍏ㄩ妫€銆佺粨鏋勬牎楠屽拰 mock fallback銆?- `src/stateRepository.js`锛氱姸鎬佷粨鍌ㄥ眰锛岀粺涓€灏佽 `localStorage` 璇诲啓鍜岄粯璁ょ姸鎬佽ˉ榻愩€?- `src/auditLog.js`锛氬璁℃棩蹇楀叆鍙ｏ紝缁熶竴璁板綍瀹夊叏鎷︽埅銆佹彁绀哄紡鍥炵瓟鍜屽闀夸妇鎶ャ€?- `smoke-test.mjs`锛氳鐩?API 瀹㈡埛绔€佺姸鎬佷粨鍌ㄣ€佸璁℃棩蹇椼€丏eepSeek 璇锋眰鏍煎紡鍜屽涔犳湇鍔°€?
## 鏈嶅姟绔?API

鍓嶇璋冪敤锛?
- `POST /api/tutor-reply`
- `POST /api/practice`
- `POST /api/answer-feedback`
- `POST /api/review-quiz`
- `GET /api/health`

鏈嶅姟绔皟鐢?DeepSeek锛?
- `POST https://api.deepseek.com/chat/completions`
- Header锛歚Authorization: Bearer $DEEPSEEK_API_KEY`
- 榛樿妯″瀷锛歚deepseek-v4-flash`

## 鍚庣画宸ョ▼鍖栧缓璁?
- 灏?`src/data.js` 涓殑鐭ヨ瘑鐐广€侀鐩€佸璁℃棩蹇楄縼绉诲埌 PostgreSQL銆?- 澧炲姞鐢ㄦ埛鐧诲綍銆佸闀跨粦瀹氥€佹潈闄愭帶鍒跺拰鍚庡彴瀹℃牳娴併€?- 澧炲姞棰樼洰鎶芥銆佺籂閿欓棴鐜€佹ā鍨嬭緭鍑哄璁″拰鍚堣妯″潡銆?- 涓?DeepSeek 璋冪敤澧炲姞璇锋眰杩借釜 ID銆侀檺娴併€侀噸璇曞拰鎴愭湰缁熻銆?

## 鏈嶅姟绔寔涔呭寲

鏈嶅姟绔ā寮忎笅锛屽墠绔細浼樺厛浠?`/api/state` 璇诲彇鐘舵€侊紝骞跺湪鐢ㄦ埛璧勬枡銆佷細璇濄€佸闀跨粦瀹氥€佸鏍搁槦鍒椼€佸畨鍏ㄦ棩蹇楀彉鍖栨椂鍚屾淇濆瓨鍒版湇鍔＄銆?
褰撳墠榛樿浣跨敤 SQLite锛?
```bash
npm.cmd run dev
```

榛樿鏁版嵁搴撴枃浠讹細

```text
server/data/qisi.sqlite
```

涔熷彲浠ラ€氳繃鐜鍙橀噺鎸囧畾璺緞锛?
```bash
$env:QISI_SQLITE_PATH="E:\\data\\qisi.sqlite"
npm.cmd run dev
```

瀛樺偍灞傚叆鍙ｆ槸 `server/storage/stateStore.js`锛屽綋鍓嶅疄鐜版槸 `server/storage/sqliteStateStore.js`銆備笟鍔′唬鐮佸彧渚濊禆 `createStateStore()` 鏆撮湶鐨?`loadState()` / `saveState()`锛屽悗缁縼绉?PostgreSQL 鏃跺彲浠ユ柊澧?PG adapter锛屼繚鎸?API 鍜屽墠绔皟鐢ㄤ笉鍙樸€?

## 登录与服务端权限

系统使用 SQLite 保存用户、密码哈希、登录会话和家长绑定关系。登录成功后前端使用 Bearer Token 调用 API；学习数据、DeepSeek 请求、家长操作和后台审核均由服务端校验身份。

体验账号：

- 学生：`student` / `student123`
- 家长：`parent` / `parent123`
- 管理员：`admin` / `admin123`

生产部署前应修改或删除体验账号，并接入 HTTPS。当前会话有效期为 7 天，密码使用 scrypt 加盐哈希存储。家长只能绑定学生、调整已绑定学生的时长和提交举报；只有管理员可以处理审核项。
