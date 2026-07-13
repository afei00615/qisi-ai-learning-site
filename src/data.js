export const grades = [4, 5, 6, 7, 8, 9];
export const terms = ["上", "下"];

export const subjects = [
  { id: "chinese", name: "语文", stages: [4, 5, 6, 7, 8, 9] },
  { id: "math", name: "数学", stages: [4, 5, 6, 7, 8, 9] },
  { id: "english", name: "英语", stages: [4, 5, 6, 7, 8, 9] },
  { id: "science", name: "科学", stages: [4, 5, 6, 7, 8, 9], phase: "浙江综合" },
  { id: "history-society", name: "历史与社会", stages: [7, 8, 9], phase: "浙江初中" },
  { id: "ethics", name: "道德与法治", stages: [4, 5, 6, 7, 8, 9] }
];

export const tutorStrategies = {
  chinese: {
    title: "语文辅导规则",
    rules: [
      "先判断阅读、基础知识或写作等题型",
      "阅读题先回到原文定位依据",
      "写作先明确中心、材料和结构",
      "引导学生用自己的话组织表达",
      "用概括、仿写或修改练习巩固"
    ],
    example: "我找到了相关句子，但不知道怎么概括主要内容。"
  },
  math: {
    title: "数学解题规则",
    rules: [
      "先提取已知条件、未知量和所求",
      "提示关键方法，不直接只给答案",
      "鼓励先写出第一步或关键算式",
      "检查运算、符号、单位和完整性",
      "给 1-2 个同类或变式小练习"
    ],
    example: "我列出了方程，但不知道移项是否正确。"
  },
  english: {
    title: "英语辅导规则",
    rules: [
      "先判断词汇、语法、阅读或写作题型",
      "结合上下文和时间标志定位依据",
      "指出错误类型，不只替换成正确答案",
      "鼓励先造句、翻译或说明选择理由",
      "用替换词、变式句或短表达巩固"
    ],
    example: "我判断这里是过去时，但不知道动词该怎么变。"
  },
  science: {
    title: "科学探究规则",
    rules: [
      "先区分现象、条件、问题和结论",
      "用观察或实验数据作为推理证据",
      "涉及实验时明确变量和对照条件",
      "检查单位、图表和因果关系",
      "用相近现象或小实验迁移验证"
    ],
    example: "我看到了这个实验现象，但不知道它能说明什么。"
  },
  "history-society": {
    title: "历史与社会辅导规则",
    rules: [
      "先定位时间、地点、人物和材料来源",
      "从材料或地图中提取有效证据",
      "按背景、原因、经过和影响组织",
      "区分史实、观点和自己的判断",
      "用时间线、比较或材料题巩固"
    ],
    example: "我找到了材料中的事件，但不知道怎样分析它的影响。"
  },
  ethics: {
    title: "道德与法治辅导规则",
    rules: [
      "先识别情境中的人物、行为和争议",
      "联系规则、权利、义务或法律依据",
      "按观点、理由、材料和行动作答",
      "避免只背口号，结合具体情境分析",
      "用生活案例或辨析题迁移巩固"
    ],
    example: "我知道要遵守规则，但不知道怎样结合材料说明理由。"
  }
};

export const knowledgeMap = {
  chinese: [
    {
      id: "reading-main-idea",
      title: "阅读理解：概括主要内容",
      gradeRange: "4-7",
      goals: ["找中心句", "分段提炼", "用自己的话复述"],
      commonMistakes: ["只抄原文", "忽略人物变化", "答案过长"]
    },
    {
      id: "composition-structure",
      title: "作文：总分总结构",
      gradeRange: "4-9",
      goals: ["开头点题", "中间分层", "结尾回扣主题"],
      commonMistakes: ["事例堆砌", "缺少过渡", "中心不明确"]
    },
    {
      id: "classical-basics",
      title: "文言文：实词与句意",
      gradeRange: "7-9",
      goals: ["积累常见实词", "结合语境翻译", "辨析省略成分"],
      commonMistakes: ["逐字硬译", "忽略通假", "不看上下文"]
    }
  ],
  math: [
    {
      id: "fraction-operations",
      title: "分数与小数运算",
      gradeRange: "4-6",
      goals: ["通分", "约分", "估算结果"],
      commonMistakes: ["分母直接相加", "忘记约分", "单位不统一"]
    },
    {
      id: "linear-equation",
      title: "一元一次方程",
      gradeRange: "7-8",
      goals: ["设未知数", "移项合并", "检验结果"],
      commonMistakes: ["移项不变号", "漏乘括号", "不检验"]
    },
    {
      id: "quadratic-equation",
      title: "一元二次方程",
      gradeRange: "8-9",
      goals: ["因式分解", "配方法", "公式法"],
      commonMistakes: ["漏掉一个根", "符号看反", "判别式计算错"]
    },
    {
      id: "geometry-proof",
      title: "几何证明：三角形",
      gradeRange: "7-9",
      goals: ["找已知条件", "选择判定定理", "规范书写理由"],
      commonMistakes: ["跳步", "定理名称不准", "条件不足"]
    }
  ],
  english: [
    {
      id: "tense-present-past",
      title: "时态：一般现在与一般过去",
      gradeRange: "4-7",
      goals: ["识别时间状语", "动词形式变化", "疑问句和否定句"],
      commonMistakes: ["第三人称单数漏 s", "过去式拼写错误", "助动词后仍变形"]
    },
    {
      id: "reading-detail",
      title: "阅读：细节定位",
      gradeRange: "6-9",
      goals: ["划关键词", "回文定位", "排除干扰项"],
      commonMistakes: ["凭印象选", "忽略否定词", "看不出关键词替换"]
    },
    {
      id: "writing-sentences",
      title: "写作：句子扩写",
      gradeRange: "5-9",
      goals: ["主谓宾完整", "加入时间地点原因", "使用连接词"],
      commonMistakes: ["中文式语序", "缺少谓语", "句子过短"]
    }
  ],
  science: [
    {
      id: "life-systems",
      title: "科学：生命系统与细胞",
      gradeRange: "4-8",
      goals: ["识别结构", "对应功能", "比较生命现象"],
      commonMistakes: ["结构和功能脱节", "概念混用", "图示标注不清"]
    },
    {
      id: "matter-change",
      title: "科学：物质性质与变化",
      gradeRange: "5-9",
      goals: ["观察现象", "区分物理变化和化学变化", "用证据解释"],
      commonMistakes: ["只看颜色变化", "忽略条件", "没有证据支撑"]
    },
    {
      id: "force-motion",
      title: "科学：力与运动",
      gradeRange: "7-9",
      goals: ["受力分析", "理解惯性", "联系生活情境"],
      commonMistakes: ["把速度当力", "忽略摩擦", "方向判断错误"]
    },
    {
      id: "earth-space",
      title: "科学：地球与宇宙",
      gradeRange: "4-9",
      goals: ["读图分析", "理解周期变化", "解释自然现象"],
      commonMistakes: ["比例尺换算错", "方向判断反", "只背结论"]
    }
  ],
  "history-society": [
    {
      id: "timeline",
      title: "历史与社会：历史事件时间线",
      gradeRange: "7-9",
      goals: ["按时间排序", "理解因果", "区分人物与制度"],
      commonMistakes: ["年代混淆", "只背结论", "忽略背景"]
    },
    {
      id: "map-region",
      title: "历史与社会：区域与地图判读",
      gradeRange: "7-9",
      goals: ["方向比例尺", "区域特征", "人地关系"],
      commonMistakes: ["方向默认上北", "比例尺换算错", "区域特征套用"]
    }
  ],
  ethics: [
    {
      id: "rule-responsibility",
      title: "道德与法治：规则与责任",
      gradeRange: "4-9",
      goals: ["理解规则作用", "分析权利义务", "联系生活案例"],
      commonMistakes: ["只背条文", "案例分析空泛", "权利义务混淆"]
    },
    {
      id: "law-basics",
      title: "道德与法治：法律基础",
      gradeRange: "7-9",
      goals: ["认识法律作用", "区分违法行为", "学会依法维权"],
      commonMistakes: ["概念混淆", "忽略主体", "缺少法治意识"]
    }
  ]
};

export const sampleQuestions = [
  {
    id: "q1",
    subject: "math",
    grade: 7,
    knowledgeId: "linear-equation",
    stem: "解方程：3(x - 2) = 2x + 5。请先写出第一步。",
    answer: "x = 11",
    hint: "先把括号展开，再把含 x 的项移到同一边。",
    difficulty: "基础"
  },
  {
    id: "q2",
    subject: "english",
    grade: 6,
    knowledgeId: "tense-present-past",
    stem: "将句子改为一般过去时：She goes to school by bus.",
    answer: "She went to school by bus.",
    hint: "找到谓语动词 goes，它的不规则过去式是什么？",
    difficulty: "基础"
  },
  {
    id: "q3",
    subject: "chinese",
    grade: 5,
    knowledgeId: "reading-main-idea",
    stem: "读完一篇写人记事文章后，概括主要内容时要包含哪些信息？",
    answer: "人物、事件、结果或人物变化。",
    hint: "可以用“谁，在什么情况下，做了什么，结果怎样”来检查。",
    difficulty: "基础"
  },
  {
    id: "q4",
    subject: "science",
    grade: 7,
    knowledgeId: "force-motion",
    stem: "为什么急刹车时，人会向前倾？请用科学中的惯性解释。",
    answer: "人体由于惯性保持原来的运动状态，所以会向前倾。",
    hint: "先判断车和人的运动状态分别发生了什么变化。",
    difficulty: "基础"
  },
  {
    id: "q5",
    subject: "history-society",
    grade: 7,
    knowledgeId: "map-region",
    stem: "读地图时，比例尺 1:100000 表示图上 1 厘米对应实际多少千米？",
    answer: "1 千米",
    hint: "先把 100000 厘米换算成米，再换算成千米。",
    difficulty: "基础"
  },
  {
    id: "q6",
    subject: "ethics",
    grade: 7,
    knowledgeId: "rule-responsibility",
    stem: "为什么说遵守规则也是对他人权利的尊重？请举一个生活例子。",
    answer: "规则维护公共秩序，保障每个人的合法权益。",
    hint: "可以从排队、交通、课堂秩序中选一个例子。",
    difficulty: "基础"
  }
];

export const safetyKeywords = [
  "直接给答案",
  "帮我作弊",
  "考试答案",
  "身份证",
  "银行卡",
  "自杀",
  "伤害自己",
  "色情",
  "暴力细节",
  "联系方式"
];

export const defaultState = {
  activeRole: "student",
  currentUserId: "student-demo",
  users: [
    { id: "student-demo", role: "student", name: "小安", label: "学生演示账号" },
    { id: "parent-demo", role: "parent", name: "家长", label: "家长演示账号" },
    { id: "admin-demo", role: "admin", name: "管理员", label: "管理员演示账号" }
  ],
  student: {
    name: "小安",
    bindingCode: "AX7K29",
    grade: 7,
    term: "上",
    dailyMinutes: 26,
    dailyLimit: 60,
    weakPoints: ["一元一次方程", "阅读细节定位", "科学：力与运动"],
    streak: 4
  },
  parent: {
    name: "家长",
    linkedStudent: "未绑定",
    linkedStudentId: "",
    bindingStatus: "unlinked"
  },
  chats: [
    {
      role: "assistant",
      text: "你好，我是解题助手。我会先提示思路，再一步步陪你完成。把题目发给我吧。"
    }
  ],
  knowledgeChats: [
    {
      role: "assistant",
      title: "知识问答",
      text: "你好，我可以帮你梳理概念、公式、知识点区别和学习方法。比如：科学里的惯性是什么意思？"
    }
  ],
  reports: [
    { label: "本周练习", value: "38 题" },
    { label: "正确率", value: "76%" },
    { label: "平均学习", value: "24 分钟/天" },
    { label: "待复习", value: "3 个知识点" }
  ],
  safetyLogs: [
    { time: "今天 17:10", type: "提示式回答", detail: "数学题请求最终答案，已改为分步引导。" },
    { time: "昨天 20:22", type: "内容举报", detail: "家长反馈一道英语题解析不清晰，待复核。" }
  ],
  moderationQueue: [
    {
      id: "mq-seed-1",
      type: "AI 生成题抽检",
      source: "system",
      status: "pending",
      priority: "中",
      detail: "期末复习测验中有 3 道科学题待抽检。",
      createdAt: "今天 17:10"
    },
    {
      id: "mq-seed-2",
      type: "家长举报",
      source: "parent",
      status: "pending",
      priority: "高",
      detail: "家长反馈一道英语题解析不清晰，待复核。",
      createdAt: "昨天 20:22"
    }
  ],
  reviewHistory: []
};


