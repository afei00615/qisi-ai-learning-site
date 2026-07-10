import { grades, knowledgeMap, subjects, terms } from "./data.js";
import { createLearningApiClient } from "./apiClient.js";
import { recordAuditLog } from "./auditLog.js";
import { createStateRepository } from "./stateRepository.js";

const learningApi = createLearningApiClient();
const stateRepository = createStateRepository();

let state = stateRepository.load();
let activeView = "qa";
let activeSubject = "math";
ensureChatSessionMaps();
let activeKnowledge = "linear-equation";
let activePractice = [];
let activeQuiz = null;
let practiceLoading = false;
let reviewLoadingMode = "";
let systemNotice = "";

const app = document.querySelector("#app");

function saveState() {
  stateRepository.save(state);
}

function render() {
  ensureActiveSubject();

  if (!currentUser()) {
    app.innerHTML = renderLogin();
    bindLoginEvents();
    return;
  }

  if (shouldShowProfileSetup()) {
    app.innerHTML = renderProfileSetup();
    bindProfileSetupEvents();
    return;
  }

  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main-panel">
        ${renderTopbar()}
        ${systemNotice ? `<div class="system-notice">${escapeHtml(systemNotice)}</div>` : ""}
        ${renderView()}
      </main>
    </div>
  `;
  bindEvents();
}

function renderLogin() {
  return `
    <main class="profile-setup-page">
      <section class="profile-setup-panel">
        <div class="brand profile-setup-brand">
          <div class="brand-mark">启</div>
          <div>
            <h1>启思 AI</h1>
            <p>选择演示账号进入对应工作台。</p>
          </div>
        </div>
        <form class="profile-setup-form" id="login-form">
          <label>
            登录身份
            <select id="login-user">
              ${state.users.map((user) => `<option value="${user.id}">${roleLabel(user.role)} · ${escapeHtml(user.name)}</option>`).join("")}
            </select>
          </label>
          <button type="submit">登录</button>
        </form>
      </section>
    </main>
  `;
}

function renderProfileSetup() {
  return `
    <main class="profile-setup-page">
      <section class="profile-setup-panel">
        <div class="brand profile-setup-brand">
          <div class="brand-mark">启</div>
          <div>
            <h1>启思 AI</h1>
            <p>先建立学习档案，再开始个性化辅导。</p>
          </div>
        </div>
        <form class="profile-setup-form" id="profile-setup-form">
          <label>
            学生昵称
            <input id="profile-name" type="text" maxlength="12" value="${escapeHtml(state.student.name || "小安")}" autocomplete="name" />
          </label>
          <div class="profile-setup-grid">
            <label>
              当前年级
              <select id="profile-grade">
                ${grades.map((grade) => `<option value="${grade}" ${state.student.grade === grade ? "selected" : ""}>${grade} 年级</option>`).join("")}
              </select>
            </label>
            <label>
              当前学期
              <select id="profile-term">
                ${terms.map((term) => `<option value="${term}" ${currentTerm() === term ? "selected" : ""}>${term} 学期</option>`).join("")}
              </select>
            </label>
          </div>
          <button type="submit">保存并开始</button>
        </form>
      </section>
    </main>
  `;
}

function renderSidebar() {
  const nav = visibleNavItems();

  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">启</div>
        <div>
          <h1>启思 AI</h1>
          <p>中小学生学习助手</p>
        </div>
      </div>
      <nav class="nav-list">
        ${nav
          .map(
            (item) => `
            <button class="nav-item ${activeView === item.id ? "active" : ""}" data-view="${item.id}">
              <span>${item.label}</span>
              <small>${item.desc}</small>
            </button>
          `
          )
          .join("")}
      </nav>
      <div class="compliance-note">
        <strong>安全默认</strong>
        <span>启发式回答、时长提醒、敏感内容拦截、家长可见。</span>
      </div>
    </aside>
  `;
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">免费试用 MVP</p>
        <h2>${viewTitle()}</h2>
      </div>
      <div class="profile-controls">
        <div class="account-chip">
          <strong>${escapeHtml(currentUser().name)}</strong>
          <span>${roleLabel(currentRole())}</span>
          <button type="button" class="secondary compact" id="logout-button">切换</button>
        </div>
        ${currentRole() === "student" ? `<span class="bind-code">绑定码 ${escapeHtml(state.student.bindingCode)}</span>` : ""}
        <label>
          年级
          <select id="grade-select">
            ${grades.map((grade) => `<option value="${grade}" ${state.student.grade === grade ? "selected" : ""}>${grade} 年级</option>`).join("")}
          </select>
        </label>
        <label>
          学期
          <select id="term-select">
            ${terms.map((term) => `<option value="${term}" ${currentTerm() === term ? "selected" : ""}>${term} 学期</option>`).join("")}
          </select>
        </label>
        <label>
          学科
          <select id="subject-select">
            ${availableSubjects()
              .map(
                (subject) =>
                  `<option value="${subject.id}" ${activeSubject === subject.id ? "selected" : ""}>${subject.name}${subject.phase ? " · " + subject.phase : ""}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>
    </header>
  `;
}

function visibleNavItems() {
  const nav = [
    { id: "qa", label: "解题助手", desc: "题目讲解", roles: ["student", "admin"] },
    { id: "knowledge", label: "知识问答", desc: "概念查询", roles: ["student", "admin"] },
    { id: "homework", label: "作业辅导", desc: "知识点练习", roles: ["student", "admin"] },
    { id: "review", label: "期中/期末复习", desc: "在线测验", roles: ["student", "admin"] },
    { id: "parent", label: "家长端", desc: "学习报告", roles: ["parent", "admin"] },
    { id: "admin", label: "管理端", desc: "内容与安全", roles: ["admin"] }
  ];
  return nav.filter((item) => item.roles.includes(currentRole()));
}

function viewTitle() {
  return {
    qa: "解题助手",
    knowledge: "知识问答",
    homework: "作业辅导",
    review: "期中/期末复习",
    parent: "家长端",
    admin: "管理端"
  }[activeView];
}

function renderView() {
  if (!canAccessView(activeView)) {
    activeView = defaultViewForRole(currentRole());
  }
  if (activeView === "qa") return renderQA();
  if (activeView === "knowledge") return renderKnowledgeQA();
  if (activeView === "homework") return renderHomework();
  if (activeView === "review") return renderReview();
  if (activeView === "parent") return renderParent();
  return renderAdmin();
}

function renderQA() {
  return `
    <section class="grid two-column">
      <div class="panel chat-panel">
        <div class="section-heading">
          <div>
            <h3>解题助手</h3>
            <p>围绕具体题目讲思路、步骤和同类练习，不直接代写答案。</p>
          </div>
          <span class="pill">${state.student.dailyMinutes}/${state.student.dailyLimit} 分钟</span>
        </div>
        <div class="chat-window" id="chat-window">
          ${currentSolveChats().map((msg) => renderChatMessage(msg)).join("")}
        </div>
        <div class="composer-box">
          <form class="composer" id="qa-form">
            <input id="qa-input" type="text" placeholder="例如：x² - 5x + 6 = 0 怎么做？" autocomplete="off" />
            <button type="submit">发送</button>
          </form>
          <div class="math-toolbar" aria-label="常用数学符号">
            <button type="button" data-insert="x²" title="插入 x 的平方">x²</button>
            <button type="button" data-insert="x³" title="插入 x 的立方">x³</button>
            <button type="button" data-insert="²" title="插入平方上标">²</button>
            <button type="button" data-insert="³" title="插入立方上标">³</button>
            <button type="button" data-insert="√()" title="插入开平方模板">√()</button>
            <button type="button" data-insert="∛()" title="插入开立方模板">∛()</button>
            <button type="button" data-insert="/" title="插入分数或除法斜杠">a/b</button>
            <button type="button" data-insert="| |" title="插入绝对值模板">| |</button>
            <button type="button" data-insert="×" title="插入乘号">×</button>
            <button type="button" data-insert="÷" title="插入除号">÷</button>
            <button type="button" data-insert="≤" title="插入小于等于">≤</button>
            <button type="button" data-insert="≥" title="插入大于等于">≥</button>
          </div>
          <p class="math-input-tip">可直接输入 x^2、x^3、sqrt(16)、cbrt(8)，发送时会转成 x²、x³、√(16)、∛(8)。</p>
        </div>
      </div>
      <aside class="panel">
        <h3>解题规则</h3>
        <ul class="check-list">
          <li>先识别年级、学科和知识点</li>
          <li>先提示，不直接给最终答案</li>
          <li>要求学生写出第一步</li>
          <li>给 1-2 个同类小练习</li>
          <li>记录疑似求答案和安全事件</li>
        </ul>
        <div class="mini-card">
          <strong>推荐提问方式</strong>
          <p>“我做到了第二步，但不知道移项对不对。”</p>
        </div>
      </aside>
    </section>
  `;
}

function renderKnowledgeQA() {
  return `
    <section class="grid two-column">
      <div class="panel chat-panel">
        <div class="section-heading">
          <div>
            <h3>知识问答</h3>
            <p>查询概念、公式、知识点区别和通用学习方法，不需要输入完整题目。</p>
          </div>
          <span class="pill">${gradeTermLabel()} · ${subjectName(activeSubject)}</span>
        </div>
        <div class="chat-window" id="knowledge-chat-window">
          ${currentKnowledgeChats().map((msg) => renderChatMessage(msg)).join("")}
        </div>
        <form class="composer" id="knowledge-form">
          <input id="knowledge-input" type="text" placeholder="例如：一元二次方程有哪些常用解法？" autocomplete="off" />
          <button type="submit">发送</button>
        </form>
      </div>
      <aside class="panel">
        <h3>适合这样问</h3>
        <ul class="check-list">
          <li>某个概念是什么意思</li>
          <li>两个知识点有什么区别</li>
          <li>公式什么时候使用</li>
          <li>这一章应该怎么复习</li>
        </ul>
        <div class="mini-card">
          <strong>示例</strong>
          <p>“因式分解和配方法有什么区别？”</p>
        </div>
      </aside>
    </section>
  `;
}

function renderChatMessage(msg) {
  const sender = msg.role === "assistant" ? "AI老师" : state.student.name;
  return `
    <article class="message ${msg.role}">
      <span>${escapeHtml(sender)}</span>
      ${msg.role === "assistant" && msg.originalQuestion ? renderAssistantAnswer(msg) : renderBasicMessageBody(msg)}
    </article>
  `;
}

function renderBasicMessageBody(msg) {
  const title = msg.role === "assistant" && msg.title ? `<strong class="message-title">${escapeHtml(msg.title)}${msg.streaming ? `<span class="streaming-dot">生成中</span>` : ""}</strong>` : "";
  const body = msg.text ? formatText(msg.text) : msg.streaming ? `<span class="streaming-placeholder">正在组织回答...</span>` : "";
  return `${title}<p>${body}</p>`;
}

function renderAssistantAnswer(msg) {
  const exercises = Array.isArray(msg.microPractice) ? msg.microPractice : [];
  return `
    <div class="answer-blocks">
      <section class="answer-block answer-block-question">
        <strong>原题</strong>
        <p>${formatText(msg.originalQuestion)}</p>
      </section>
      <section class="answer-block answer-block-explanation">
        <strong>${escapeHtml(msg.title || "解答思路")}${msg.streaming ? `<span class="streaming-dot">生成中</span>` : ""}</strong>
        <p>${msg.text ? formatText(msg.text) : `<span class="streaming-placeholder">正在组织思路...</span>`}</p>
      </section>
      ${
        exercises.length
          ? `<section class="answer-block answer-block-practice">
              <strong>同类练习</strong>
              <ul>${exercises.map((item) => `<li>${formatText(item.stem || item)}</li>`).join("")}</ul>
            </section>`
          : ""
      }
    </div>
  `;
}

function renderHomework() {
  const points = knowledgeMap[activeSubject] || [];
  const selected = points.find((item) => item.id === activeKnowledge) || points[0];
  if (!activeKnowledge && selected) activeKnowledge = selected.id;

  return `
    <section class="grid homework-layout">
      <div class="panel homework-control-panel">
        <div class="section-heading">
          <div>
            <h3>知识点地图</h3>
            <p>选择年级和学科后，围绕知识点生成 5 道练习。</p>
          </div>
          <button class="secondary" id="generate-practice" ${practiceLoading ? "disabled" : ""}>${practiceLoading ? "生成中..." : "生成练习"}</button>
        </div>
        <div class="knowledge-list">
          ${points
            .map(
              (point) => `
              <button class="knowledge-item ${activeKnowledge === point.id ? "active" : ""}" data-knowledge="${point.id}">
                <strong>${point.title}</strong>
                <span>${point.gradeRange} 年级 · ${point.goals.join(" / ")}</span>
              </button>
            `
            )
            .join("")}
        </div>
      </div>
      <div class="panel homework-practice-panel">
        <h3>练习区</h3>
        ${practiceLoading ? renderLoadingState("正在生成练习", "AI 正在结合年级、学期和知识点生成题目。") : activePractice.length ? renderPracticeList(activePractice) : renderEmptyPractice(selected)}
      </div>
    </section>
  `;
}

function renderLoadingState(title, detail) {
  return `
    <div class="loading-state">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div>
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(detail)}</p>
      </div>
    </div>
  `;
}

function renderEmptyPractice(selected) {
  return `
    <div class="empty-state">
      <h4>${selected ? selected.title : "请选择知识点"}</h4>
      <p>点击“生成练习”后，会生成题干、提示、参考解析、知识点和难度。学生先填写思路，再查看反馈。</p>
    </div>
  `;
}

function renderPracticeList(questions) {
  return `
    <div class="practice-list">
      ${questions
        .map(
          (q, index) => `
          <article class="question-card">
            <div class="question-meta">
              <span>${escapeHtml(q.difficulty)}</span>
              <span>${escapeHtml(q.knowledge)}</span>
            </div>
            <h4>${index + 1}. ${escapeHtml(q.stem)}</h4>
            <p class="hint">提示：${escapeHtml(q.hint)}</p>
            <form class="answer-form" data-question-index="${index}">
              <input type="text" placeholder="先写你的思路或第一步" />
              <button type="submit">检查</button>
            </form>
            <div class="feedback" id="practice-feedback-${index}"></div>
          </article>
        `
        )
        .join("")}
    </div>
  `;
}

function renderReview() {
  return `
    <section class="grid review-layout">
      <div class="panel review-control-panel">
        <div class="section-heading">
          <div>
            <h3>复习模式</h3>
            <p>按${gradeTermLabel()}的期中或期末范围生成个性化测验，结合薄弱知识点。</p>
          </div>
        </div>
        <div class="review-actions">
          <button id="midterm-quiz" ${reviewLoadingMode ? "disabled" : ""}>${reviewLoadingMode === "midterm" ? "生成中..." : "生成期中复习"}</button>
          <button id="final-quiz" class="secondary" ${reviewLoadingMode ? "disabled" : ""}>${reviewLoadingMode === "final" ? "生成中..." : "生成期末复习"}</button>
        </div>
        <div class="weak-box">
          <strong>当前薄弱点</strong>
          <div class="tag-row">
            ${state.student.weakPoints.map((point) => `<span class="tag">${point}</span>`).join("")}
          </div>
        </div>
      </div>
      <div class="panel review-quiz-panel">
        ${reviewLoadingMode ? renderLoadingState("正在生成复习测验", reviewLoadingMode === "midterm" ? "正在整理期中范围和薄弱点。" : "正在整理期末综合范围和薄弱点。") : activeQuiz ? renderQuiz(activeQuiz) : `<div class="empty-state"><h4>还没有生成测验</h4><p>选择期中或期末后，系统会生成在线答题卷。</p></div>`}
      </div>
    </section>
  `;
}

function renderQuiz(quiz) {
  return `
    <div class="quiz-header">
      <h3>${escapeHtml(quiz.title)}</h3>
      <p>${escapeHtml(quiz.scope)} · ${quiz.questions.length} 题</p>
    </div>
    ${renderPracticeList(quiz.questions)}
  `;
}

function renderParent() {
  if (!isParentLinked() && currentRole() === "parent") return renderParentBinding();

  return `
    <section class="grid dashboard-grid">
      <div class="panel wide">
        <div class="section-heading">
          <div>
            <h3>${state.parent.linkedStudent} 的学习报告</h3>
            <p>家长可以看到趋势和风险，不展示孩子的隐私敏感输入全文。</p>
          </div>
          <button class="secondary" id="report-content">举报内容</button>
        </div>
        <div class="metrics">
          ${state.reports.map((item) => `<div class="metric"><span>${item.label}</span><strong>${item.value}</strong></div>`).join("")}
        </div>
      </div>
      <div class="panel">
        <h3>薄弱知识点</h3>
        <div class="tag-row vertical">
          ${state.student.weakPoints.map((point) => `<span class="tag">${point}</span>`).join("")}
        </div>
      </div>
      <div class="panel">
        <h3>AI 对话摘要</h3>
        <p class="summary-text">本周主要在数学方程、英语时态和语文阅读上寻求帮助。系统多次引导学生先写步骤，再给反馈。</p>
      </div>
      <div class="panel wide">
        <h3>家长控制</h3>
        <div class="control-row">
          <label>每日学习上限 <input id="limit-input" type="number" min="10" max="120" value="${state.student.dailyLimit}" /> 分钟</label>
          <button id="save-limit">保存</button>
        </div>
      </div>
    </section>
  `;
}

function renderParentBinding() {
  return `
    <section class="grid dashboard-grid">
      <div class="panel wide">
        <div class="section-heading">
          <div>
            <h3>绑定学生</h3>
            <p>输入学生端显示的绑定码，绑定后才能查看学习报告和设置时长。</p>
          </div>
        </div>
        <form class="control-row" id="bind-parent-form">
          <label>学生绑定码 <input id="bind-code-input" type="text" maxlength="12" placeholder="例如 AX7K29" /></label>
          <button type="submit">绑定</button>
        </form>
      </div>
    </section>
  `;
}

function renderAdmin() {
  const subject = subjects.find((item) => item.id === activeSubject);
  return `
    <section class="grid dashboard-grid">
      <div class="panel wide">
        <div class="section-heading">
          <div>
            <h3>年级与学科配置</h3>
            <p>当前：${gradeTermLabel()} · ${subject?.name || "数学"}</p>
          </div>
          <span class="pill">无付费模块</span>
        </div>
        <div class="admin-table">
          ${subjects
            .map(
              (item) => `
              <div class="admin-row">
                <strong>${item.name}</strong>
                <span>${item.stages.join("、")} 年级</span>
                <em>${item.phase || "浙江义务教育"}</em>
              </div>
            `
            )
            .join("")}
        </div>
      </div>
      <div class="panel wide">
        <h3>内容审核队列</h3>
        <div class="moderation-list">
          ${renderModerationQueue()}
        </div>
      </div>
      <div class="panel">
        <h3>安全日志</h3>
        <ul class="activity-list">
          ${state.safetyLogs.map((log) => `<li><strong>${log.type}</strong><span>${log.time} · ${log.detail}</span></li>`).join("")}
        </ul>
      </div>
    </section>
  `;
}

function renderModerationQueue() {
  const queue = Array.isArray(state.moderationQueue) ? state.moderationQueue : [];
  if (!queue.length) return `<div class="empty-state"><h4>暂无待审核内容</h4><p>举报、抽检和纠错会进入这里。</p></div>`;

  return queue
    .map(
      (item) => `
        <article class="moderation-card ${item.status}">
          <div>
            <div class="question-meta">
              <span>${escapeHtml(item.priority || "中")}</span>
              <span>${escapeHtml(statusLabel(item.status))}</span>
            </div>
            <h4>${escapeHtml(item.type)}</h4>
            <p>${escapeHtml(item.detail)}</p>
            <small>${escapeHtml(item.createdAt || "刚刚")} · ${escapeHtml(item.source || "system")}</small>
          </div>
          <div class="moderation-actions">
            <button type="button" data-review-action="approved" data-review-id="${item.id}">通过</button>
            <button type="button" class="secondary" data-review-action="rejected" data-review-id="${item.id}">驳回</button>
            <button type="button" class="secondary" data-review-action="escalated" data-review-id="${item.id}">升级复核</button>
          </div>
        </article>
      `
    )
    .join("");
}

function bindLoginEvents() {
  document.querySelector("#login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const userId = document.querySelector("#login-user").value;
    const user = state.users.find((item) => item.id === userId);
    state.currentUserId = userId;
    state.activeRole = user?.role || "student";
    activeView = defaultViewForRole(state.activeRole);
    saveState();
    render();
  });
}

function bindProfileSetupEvents() {
  document.querySelector("#profile-setup-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.querySelector("#profile-name").value.trim() || "小安";
    const grade = Number(document.querySelector("#profile-grade").value);
    const term = document.querySelector("#profile-term").value;

    state.student.name = name;
    state.student.grade = grade;
    state.student.term = normalizeTerm(term);
    state.student.profileComplete = true;
    state.student.profileCreatedAt ||= new Date().toISOString();
    state.parent.linkedStudent = name;
    systemNotice = "";
    saveState();
    render();
  });
}

function bindEvents() {
  document.querySelector("#logout-button")?.addEventListener("click", () => {
    state.currentUserId = "";
    saveState();
    render();
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      render();
    });
  });

  document.querySelector("#grade-select")?.addEventListener("change", (event) => {
    state.student.grade = Number(event.target.value);
    saveState();
    render();
  });

  document.querySelector("#term-select")?.addEventListener("change", (event) => {
    state.student.term = normalizeTerm(event.target.value);
    activePractice = [];
    activeQuiz = null;
    practiceLoading = false;
    reviewLoadingMode = "";
    saveState();
    render();
  });

  document.querySelector("#subject-select")?.addEventListener("change", (event) => {
    activeSubject = event.target.value;
    activeKnowledge = (knowledgeMap[activeSubject] || [])[0]?.id || "";
    activePractice = [];
    activeQuiz = null;
    practiceLoading = false;
    reviewLoadingMode = "";
    render();
  });

  document.querySelector("#qa-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#qa-input");
    const message = normalizeMathInput(input.value.trim());
    if (!message) return;

    const solveChats = currentSolveChats();
    const conversationContext = buildConversationContext(solveChats);

    const assistantMessage = {
      role: "assistant",
      title: "解答思路",
      text: "",
      originalQuestion: message,
      microPractice: [],
      streaming: true
    };

    solveChats.push({ role: "user", text: message });
    solveChats.push(assistantMessage);
    systemNotice = "";
    render();

    try {
      const finalReply = await learningApi.streamTutorReply(
        { message, subjectId: activeSubject, grade: state.student.grade, term: currentTerm(), conversationContext },
        {
          onChunk(chunk) {
            assistantMessage.text += chunk;
            render();
          },
          onEvent(event) {
            if (event.type === "meta") {
              assistantMessage.title = event.title || assistantMessage.title;
              assistantMessage.kind = event.kind || assistantMessage.kind;
              render();
            }
            if (event.type === "done") {
              assistantMessage.title = event.title || assistantMessage.title;
              assistantMessage.kind = event.kind || assistantMessage.kind;
              assistantMessage.text ||= event.text || "";
              assistantMessage.microPractice = event.microPractice || [];
              assistantMessage.streaming = false;
            }
            if (event.type === "error") {
              throw new Error(event.message || "流式回复失败");
            }
          }
        }
      );

      assistantMessage.streaming = false;
      assistantMessage.title = finalReply?.title || assistantMessage.title;
      assistantMessage.kind = finalReply?.kind || assistantMessage.kind;
      assistantMessage.text ||= finalReply?.text || "";
      assistantMessage.microPractice = finalReply?.microPractice || assistantMessage.microPractice;

      if (assistantMessage.kind === "blocked" || assistantMessage.kind === "scaffold") {
        recordAuditLog(state, {
          type: assistantMessage.kind === "blocked" ? "安全拦截" : "提示式回答",
          detail: assistantMessage.title,
          actor: "student"
        });
      }
      state.student.dailyMinutes = Math.min(state.student.dailyLimit, state.student.dailyMinutes + 3);
      saveState();
      render();
    } catch (error) {
      assistantMessage.streaming = false;
      assistantMessage.title = "服务暂时不可用";
      assistantMessage.text = error.message;
      assistantMessage.microPractice = [];
      showSystemError(error);
    }
  });

  document.querySelector("#knowledge-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#knowledge-input");
    const message = input.value.trim();
    if (!message) return;

    const knowledgeChats = currentKnowledgeChats();
    const conversationContext = buildConversationContext(knowledgeChats);
    const assistantMessage = {
      role: "assistant",
      title: "知识讲解",
      text: "",
      streaming: true
    };

    knowledgeChats.push({ role: "user", text: message });
    knowledgeChats.push(assistantMessage);
    systemNotice = "";
    render();

    try {
      const finalReply = await learningApi.streamTutorReply(
        { message, subjectId: activeSubject, grade: state.student.grade, term: currentTerm(), mode: "knowledge", conversationContext },
        {
          onChunk(chunk) {
            assistantMessage.text += chunk;
            render();
          },
          onEvent(event) {
            if (event.type === "meta") {
              assistantMessage.title = event.title || assistantMessage.title;
              assistantMessage.kind = event.kind || assistantMessage.kind;
              render();
            }
            if (event.type === "done") {
              assistantMessage.title = event.title || assistantMessage.title;
              assistantMessage.kind = event.kind || assistantMessage.kind;
              assistantMessage.text ||= event.text || "";
              assistantMessage.streaming = false;
            }
            if (event.type === "error") {
              throw new Error(event.message || "流式回复失败");
            }
          }
        }
      );

      assistantMessage.streaming = false;
      assistantMessage.title = finalReply?.title || assistantMessage.title;
      assistantMessage.kind = finalReply?.kind || assistantMessage.kind;
      assistantMessage.text ||= finalReply?.text || "";
      saveState();
      render();
    } catch (error) {
      assistantMessage.streaming = false;
      assistantMessage.title = "服务暂时不可用";
      assistantMessage.text = error.message;
      showSystemError(error);
    }
  });

  document.querySelectorAll("[data-insert]").forEach((button) => {
    button.addEventListener("click", () => {
      insertAtCursor(document.querySelector("#qa-input"), button.dataset.insert);
    });
  });

  document.querySelectorAll("[data-knowledge]").forEach((button) => {
    button.addEventListener("click", () => {
      activeKnowledge = button.dataset.knowledge;
      render();
    });
  });

  document.querySelector("#generate-practice")?.addEventListener("click", async () => {
    practiceLoading = true;
    activePractice = [];
    systemNotice = "";
    render();
    try {
      activePractice = await learningApi.generatePractice({
        subjectId: activeSubject,
        grade: state.student.grade,
        term: currentTerm(),
        knowledgeId: activeKnowledge,
        count: 5
      });
      systemNotice = "";
    } catch (error) {
      showSystemError(error);
    } finally {
      practiceLoading = false;
      render();
    }
  });

  document.querySelectorAll(".answer-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const index = Number(form.dataset.questionIndex);
      const questions = activeQuiz?.questions || activePractice;
      try {
        const result = await learningApi.gradeAnswer({ question: questions[index], answer: form.querySelector("input").value });
        const feedback = document.querySelector(`#practice-feedback-${index}`);
        feedback.innerHTML = `<strong>${escapeHtml(result.score)} 分</strong><span>${escapeHtml(result.feedback)}</span>`;
        feedback.classList.add("show");
        systemNotice = "";
      } catch (error) {
        showSystemError(error);
      }
    });
  });

  document.querySelector("#midterm-quiz")?.addEventListener("click", async () => {
    reviewLoadingMode = "midterm";
    activeQuiz = null;
    systemNotice = "";
    render();
    try {
      activeQuiz = await learningApi.buildReviewQuiz({ subjectId: activeSubject, grade: state.student.grade, term: currentTerm(), mode: "midterm", weakPoints: state.student.weakPoints });
      systemNotice = "";
    } catch (error) {
      showSystemError(error);
    } finally {
      reviewLoadingMode = "";
      render();
    }
  });

  document.querySelector("#final-quiz")?.addEventListener("click", async () => {
    reviewLoadingMode = "final";
    activeQuiz = null;
    systemNotice = "";
    render();
    try {
      activeQuiz = await learningApi.buildReviewQuiz({ subjectId: activeSubject, grade: state.student.grade, term: currentTerm(), mode: "final", weakPoints: state.student.weakPoints });
      systemNotice = "";
    } catch (error) {
      showSystemError(error);
    } finally {
      reviewLoadingMode = "";
      render();
    }
  });

  document.querySelector("#save-limit")?.addEventListener("click", () => {
    state.student.dailyLimit = Number(document.querySelector("#limit-input").value);
    saveState();
    render();
  });

  document.querySelector("#bind-parent-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = document.querySelector("#bind-code-input").value.trim().toUpperCase();
    if (code !== String(state.student.bindingCode).toUpperCase()) {
      systemNotice = "绑定码不正确，请让学生端重新查看绑定码。";
      render();
      return;
    }
    state.parent.bindingStatus = "linked";
    state.parent.linkedStudent = state.student.name;
    state.parent.linkedStudentId = "student-demo";
    recordAuditLog(state, { type: "家长绑定", detail: `${state.parent.name} 已绑定 ${state.student.name}。`, actor: "parent" });
    saveState();
    systemNotice = "";
    render();
  });

  document.querySelector("#report-content")?.addEventListener("click", () => {
    const item = createModerationItem({
      type: "家长举报",
      source: "parent",
      priority: "高",
      detail: "家长提交了一条内容反馈，已进入管理端队列。"
    });
    state.moderationQueue.unshift(item);
    recordAuditLog(state, {
      type: "内容举报",
      detail: item.detail,
      actor: "parent"
    });
    saveState();
    systemNotice = "已提交内容举报，管理员会在后台审核。";
    render();
  });

  document.querySelectorAll("[data-review-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = state.moderationQueue.find((entry) => entry.id === button.dataset.reviewId);
      if (!item) return;
      item.status = button.dataset.reviewAction;
      item.reviewedBy = currentUser().name;
      item.reviewedAt = "刚刚";
      recordAuditLog(state, {
        type: "审核处理",
        detail: `${statusLabel(item.status)}：${item.type}`,
        actor: "admin"
      });
      saveState();
      render();
    });
  });

  const chatWindow = document.querySelector("#chat-window");
  if (chatWindow) chatWindow.scrollTop = chatWindow.scrollHeight;

  const knowledgeChatWindow = document.querySelector("#knowledge-chat-window");
  if (knowledgeChatWindow) knowledgeChatWindow.scrollTop = knowledgeChatWindow.scrollHeight;
}

function isParentLinked() {
  return state.parent.bindingStatus === "linked" && Boolean(state.parent.linkedStudentId);
}

function createModerationItem({ type, source, priority, detail }) {
  return {
    id: `mq-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    source,
    priority,
    detail,
    status: "pending",
    createdAt: "刚刚"
  };
}

function statusLabel(status) {
  return { pending: "待审核", approved: "已通过", rejected: "已驳回", escalated: "复核中" }[status] || "待审核";
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function currentRole() {
  return currentUser()?.role || state.activeRole || "student";
}

function roleLabel(role) {
  return { student: "学生", parent: "家长", admin: "管理员" }[role] || "访客";
}

function canAccessView(view) {
  return visibleNavItems().some((item) => item.id === view);
}

function defaultViewForRole(role) {
  if (role === "parent") return "parent";
  if (role === "admin") return "admin";
  return "qa";
}

function currentSolveChats(subjectId = activeSubject) {
  ensureChatSessionMaps();
  state.chatSessions[subjectId] ||= defaultSolveChats(subjectId);
  return state.chatSessions[subjectId];
}

function currentKnowledgeChats(subjectId = activeSubject) {
  ensureChatSessionMaps();
  state.knowledgeSessions[subjectId] ||= defaultKnowledgeChats(subjectId);
  return state.knowledgeSessions[subjectId];
}

function ensureChatSessionMaps() {
  state.chatSessions ||= { math: Array.isArray(state.chats) ? state.chats : defaultSolveChats("math") };
  state.knowledgeSessions ||= { math: Array.isArray(state.knowledgeChats) ? state.knowledgeChats : defaultKnowledgeChats("math") };
  state.chatSessions[activeSubject] ||= defaultSolveChats(activeSubject);
  state.knowledgeSessions[activeSubject] ||= defaultKnowledgeChats(activeSubject);
  state.chats = state.chatSessions[activeSubject];
  state.knowledgeChats = state.knowledgeSessions[activeSubject];
}

function defaultSolveChats(subjectId) {
  return [
    {
      role: "assistant",
      text: `你好，我是${subjectName(subjectId)}解题助手。我会先提示思路，再一步步陪你完成。把题目发给我吧。`
    }
  ];
}

function defaultKnowledgeChats(subjectId) {
  return [
    {
      role: "assistant",
      title: "知识问答",
      text: `你好，我可以帮你梳理${subjectName(subjectId)}的概念、公式、知识点区别和学习方法。`
    }
  ];
}

function buildConversationContext(chats = currentSolveChats(), limit = 8) {
  return chats
    .filter((msg) => !msg.streaming)
    .slice(-limit)
    .map((msg) => {
      if (msg.role === "assistant") {
        return {
          role: "assistant",
          title: msg.title || "AI回复",
          originalQuestion: msg.originalQuestion || "",
          text: summarizeContextText(msg.text || ""),
          microPractice: Array.isArray(msg.microPractice) ? msg.microPractice.slice(0, 2).map((item) => item.stem || String(item)) : []
        };
      }
      return { role: "user", text: summarizeContextText(msg.text || "") };
    });
}

function summarizeContextText(text, maxLength = 420) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function insertAtCursor(input, text) {
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  const cursor = start + text.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
}

function normalizeMathInput(value) {
  return value
    .replace(/\*\*2/g, "²")
    .replace(/\*\*3/g, "³")
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³")
    .replace(/sqrt\s*\(/gi, "√(")
    .replace(/cbrt\s*\(/gi, "∛(")
    .replace(/开平方\s*\(/g, "√(")
    .replace(/开立方\s*\(/g, "∛(");
}

function shouldShowProfileSetup() {
  return currentRole() === "student" && state.student.profileComplete !== true;
}

function currentTerm() {
  return normalizeTerm(state.student.term);
}

function normalizeTerm(term) {
  return terms.includes(term) ? term : "上";
}

function ensureActiveSubject() {
  const allowed = availableSubjects();
  if (!allowed.some((subject) => subject.id === activeSubject)) {
    activeSubject = allowed[0]?.id || "math";
    activeKnowledge = (knowledgeMap[activeSubject] || [])[0]?.id || "";
    activePractice = [];
    activeQuiz = null;
  }
  ensureChatSessionMaps();
}

function availableSubjects(grade = state.student.grade) {
  return subjects.filter((subject) => subject.stages.includes(Number(grade)));
}

function subjectName(subjectId) {
  return subjects.find((subject) => subject.id === subjectId)?.name || "数学";
}

function gradeTermLabel() {
  return `${state.student.grade} 年级${currentTerm()}`;
}

function formatText(text) {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function showSystemError(error) {
  systemNotice = friendlyErrorMessage(error);
  render();
}

function friendlyErrorMessage(error) {
  const message = error?.message || "未知错误";
  if (/aborted|abort|超时/i.test(message)) {
    return "生成时间有点久，请稍后重试。";
  }
  if (/DeepSeek|Learning API|fetch|network/i.test(message)) {
    return "服务暂时不可用，请稍后重试。";
  }
  return `服务暂时不可用：${message}`;
}

render();























