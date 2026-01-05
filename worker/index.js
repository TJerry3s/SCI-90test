/**
 * SCI-90 测试系统 - Cloudflare Workers API
 *
 * API 端点：
 * - POST /api/create - 创建新 token（管理员）
 * - GET /api/user/:token - 获取用户信息
 * - POST /api/user/:token/access - 记录首次访问
 * - POST /api/user/:token/save - 保存测试进度
 * - POST /api/user/:token/complete - 完成测试并保存结果
 * - GET /api/admin/list - 获取所有用户列表（管理员）
 * - GET /api/questions - 获取题目列表
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 路由分发
      if (path === '/api/create' && request.method === 'POST') {
        return await createToken(request, env, corsHeaders);
      }

      if (path.startsWith('/api/user/') && request.method === 'GET') {
        const token = path.split('/').pop();
        return await getUserInfo(token, env, corsHeaders);
      }

      if (path.startsWith('/api/user/') && path.endsWith('/access') && request.method === 'POST') {
        const token = path.split('/')[3];
        return await recordAccess(token, request, env, corsHeaders);
      }

      if (path.startsWith('/api/user/') && path.endsWith('/save') && request.method === 'POST') {
        const token = path.split('/')[3];
        return await saveProgress(token, request, env, corsHeaders);
      }

      if (path.startsWith('/api/user/') && path.endsWith('/complete') && request.method === 'POST') {
        const token = path.split('/')[3];
        return await completeTest(token, request, env, corsHeaders);
      }

      if (path === '/api/admin/list' && request.method === 'GET') {
        return await getAdminList(request, env, corsHeaders);
      }

      if (path === '/api/questions' && request.method === 'GET') {
        return await getQuestions(corsHeaders);
      }

      // 404
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

/**
 * 生成随机 token
 */
function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

/**
 * API: 创建新 token
 * POST /api/create
 * Body: { orderId, note, adminPassword }
 */
async function createToken(request, env, corsHeaders) {
  const { orderId, note, adminPassword } = await request.json();

  // 简单验证管理员密码（可以后续改进）
  if (adminPassword !== 'admin123') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 生成 token
  const token = generateToken();

  // 保存到数据库
  const stmt = env.DB.prepare(
    'INSERT INTO users (token, order_id, note, status) VALUES (?, ?, ?, ?)'
  );
  await stmt.bind(token, orderId, note || '', 'pending').run();

  return new Response(JSON.stringify({
    success: true,
    token,
    url: `https://sci-90test.pages.dev/?token=${token}`,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * API: 获取用户信息
 * GET /api/user/:token
 */
async function getUserInfo(token, env, corsHeaders) {
  const stmt = env.DB.prepare(
    'SELECT * FROM users WHERE token = ?'
  );
  const result = await stmt.bind(token).first();

  if (!result) {
    return new Response(JSON.stringify({ error: 'Token not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, data: result }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * API: 记录首次访问
 * POST /api/user/:token/access
 * Body: { deviceId }
 */
async function recordAccess(token, request, env, corsHeaders) {
  const { deviceId } = await request.json();

  // 检查是否已绑定设备
  const stmt = env.DB.prepare(
    'SELECT device_id, status FROM users WHERE token = ?'
  );
  const user = await stmt.bind(token).first();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Token not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 如果已有设备绑定，检查是否匹配
  if (user.device_id && user.device_id !== deviceId) {
    return new Response(JSON.stringify({
      error: '此链接已在其他设备使用，请联系客服',
      code: 'DEVICE_MISMATCH'
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 首次访问，绑定设备
  if (!user.device_id) {
    const updateStmt = env.DB.prepare(
      'UPDATE users SET device_id = ?, first_access_at = CURRENT_TIMESTAMP, status = ? WHERE token = ?'
    );
    await updateStmt.bind(deviceId, 'testing', token).run();
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * API: 保存测试进度
 * POST /api/user/:token/save
 * Body: { progress, answers, deviceId }
 */
async function saveProgress(token, request, env, corsHeaders) {
  const { progress, answers, deviceId } = await request.json();

  // 验证设备
  const stmt = env.DB.prepare(
    'SELECT device_id FROM users WHERE token = ?'
  );
  const user = await stmt.bind(token).first();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Token not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (user.device_id !== deviceId) {
    return new Response(JSON.stringify({ error: 'Unauthorized device' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 保存进度
  const updateStmt = env.DB.prepare(
    'UPDATE users SET progress = ?, answers = ? WHERE token = ?'
  );
  await updateStmt.bind(progress, JSON.stringify(answers), token).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * API: 获取所有用户列表（管理员）
 * GET /api/admin/list?adminPassword=xxx
 */
async function getAdminList(request, env, corsHeaders) {
  const url = new URL(request.url);
  const adminPassword = url.searchParams.get('adminPassword');

  if (adminPassword !== 'admin123') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const stmt = env.DB.prepare(
    'SELECT token, order_id, note, status, created_at, first_access_at, completed_at, progress FROM users ORDER BY created_at DESC'
  );
  const results = await stmt.all();

  return new Response(JSON.stringify({ success: true, data: results.results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * API: 完成测试并保存结果
 * POST /api/user/:token/complete
 * Body: { result, deviceId }
 */
async function completeTest(token, request, env, corsHeaders) {
  const { result, deviceId } = await request.json();

  // 验证设备
  const stmt = env.DB.prepare(
    'SELECT device_id FROM users WHERE token = ?'
  );
  const user = await stmt.bind(token).first();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Token not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (user.device_id !== deviceId) {
    return new Response(JSON.stringify({ error: 'Unauthorized device' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 更新状态为已完成，保存结果
  const updateStmt = env.DB.prepare(
    'UPDATE users SET status = ?, progress = 90, result = ?, completed_at = CURRENT_TIMESTAMP WHERE token = ?'
  );
  await updateStmt.bind('completed', JSON.stringify(result), token).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * API: 获取题目列表
 * GET /api/questions
 */
async function getQuestions(corsHeaders) {
  const questions = [
    { id: 1, text: "头痛", dimension: "躯体化" },
    { id: 2, text: "神经过敏，心中不踏实", dimension: "强迫症状" },
    { id: 3, text: "头脑中有不必要的想法或字句盘旋", dimension: "强迫症状" },
    { id: 4, text: "头昏或昏倒", dimension: "躯体化" },
    { id: 5, text: "对异性的兴趣减退", dimension: "人际关系敏感" },
    { id: 6, text: "对旁人责骂求全", dimension: "敌对" },
    { id: 7, text: "感到别人能控制您的思想", dimension: "偏执" },
    { id: 8, text: "责怪别人制造麻烦", dimension: "敌对" },
    { id: 9, text: "忘性大", dimension: "强迫症状" },
    { id: 10, text: "担心自己的衣饰整齐及仪态的端正", dimension: "强迫症状" },
    { id: 11, text: "容易烦恼和激动", dimension: "敌对" },
    { id: 12, text: "胸痛", dimension: "躯体化" },
    { id: 13, text: "害怕空旷的场所或街道", dimension: "恐怖" },
    { id: 14, text: "感到自己的精力下降，活动减慢", dimension: "抑郁" },
    { id: 15, text: "想结束自己的生命", dimension: "抑郁" },
    { id: 16, text: "听到旁人所听不到的声音", dimension: "精神病性" },
    { id: 17, text: "发抖", dimension: "焦虑" },
    { id: 18, text: "感到大多数人都不可信任", dimension: "人际关系敏感" },
    { id: 19, text: "胃口不好", dimension: "躯体化" },
    { id: 20, text: "容易哭泣", dimension: "抑郁" },
    { id: 21, text: "同异性相处时感到害羞不自在", dimension: "人际关系敏感" },
    { id: 22, text: "感到受骗，中了圈套或有人想抓您", dimension: "偏执" },
    { id: 23, text: "无缘无故地突然感到害怕", dimension: "恐怖" },
    { id: 24, text: "自己不能控制地发脾气", dimension: "敌对" },
    { id: 25, text: "怕单独出门", dimension: "恐怖" },
    { id: 26, text: "经常责怪自己", dimension: "抑郁" },
    { id: 27, text: "腰痛", dimension: "躯体化" },
    { id: 28, text: "感到难以完成任务", dimension: "强迫症状" },
    { id: 29, text: "感到孤独", dimension: "人际关系敏感" },
    { id: 30, text: "感到苦闷", dimension: "抑郁" },
    { id: 31, text: "过分担忧", dimension: "焦虑" },
    { id: 32, text: "对事物不感兴趣", dimension: "抑郁" },
    { id: 33, text: "感到害怕", dimension: "恐怖" },
    { id: 34, text: "您的感情容易受到伤害", dimension: "人际关系敏感" },
    { id: 35, text: "旁人能知道您的私下想法", dimension: "精神病性" },
    { id: 36, text: "感到别人不理解您、不同情您", dimension: "人际关系敏感" },
    { id: 37, text: "感到人们对您不友好，不喜欢您", dimension: "人际关系敏感" },
    { id: 38, text: "做事必须做得很慢以保证做得正确", dimension: "强迫症状" },
    { id: 39, text: "心跳得很厉害", dimension: "焦虑" },
    { id: 40, text: "恶心或胃部不舒服", dimension: "躯体化" },
    { id: 41, text: "感到比不上别人", dimension: "人际关系敏感" },
    { id: 42, text: "肌肉酸痛", dimension: "躯体化" },
    { id: 43, text: "感到有人在监视您、谈论您", dimension: "偏执" },
    { id: 44, text: "难以入睡", dimension: "抑郁" },
    { id: 45, text: "做事必须反复检查", dimension: "强迫症状" },
    { id: 46, text: "难以作出决定", dimension: "强迫症状" },
    { id: 47, text: "怕乘电车、公共汽车、地铁或火车", dimension: "恐怖" },
    { id: 48, text: "呼吸有困难", dimension: "焦虑" },
    { id: 49, text: "一阵阵发冷或发热", dimension: "焦虑" },
    { id: 50, text: "因为感到害怕而避开某些东西、场合或活动", dimension: "恐怖" },
    { id: 51, text: "脑子变空了", dimension: "精神病性" },
    { id: 52, text: "身体发麻或刺痛", dimension: "躯体化" },
    { id: 53, text: "喉咙有梗塞感", dimension: "躯体化" },
    { id: 54, text: "感到前途没有希望", dimension: "抑郁" },
    { id: 55, text: "不能集中注意力", dimension: "强迫症状" },
    { id: 56, text: "感到身体的某一部分软弱无力", dimension: "躯体化" },
    { id: 57, text: "感到紧张或容易紧张", dimension: "焦虑" },
    { id: 58, text: "感到手或脚发重", dimension: "躯体化" },
    { id: 59, text: "想到死亡的事", dimension: "抑郁" },
    { id: 60, text: "吃得太多", dimension: "躯体化" },
    { id: 61, text: "当别人看着您或谈论您时感到不自在", dimension: "人际关系敏感" },
    { id: 62, text: "有一些不属于您自己的想法", dimension: "精神病性" },
    { id: 63, text: "有想打人或伤害他人的冲动", dimension: "敌对" },
    { id: 64, text: "醒得太早", dimension: "抑郁" },
    { id: 65, text: "必须反复洗手、点数目", dimension: "强迫症状" },
    { id: 66, text: "睡得不稳不深", dimension: "抑郁" },
    { id: 67, text: "有想摔坏或破坏东西的想法", dimension: "敌对" },
    { id: 68, text: "有一些别人没有的想法或念头", dimension: "精神病性" },
    { id: 69, text: "感到对别人神经过敏", dimension: "人际关系敏感" },
    { id: 70, text: "在商店或电影院等人多的地方感到不自在", dimension: "恐怖" },
    { id: 71, text: "感到任何事情都很困难", dimension: "抑郁" },
    { id: 72, text: "一阵阵恐惧或惊恐", dimension: "恐怖" },
    { id: 73, text: "感到公共场合吃东西很不舒服", dimension: "恐怖" },
    { id: 74, text: "经常与人争论", dimension: "敌对" },
    { id: 75, text: "单独一人时神经很紧张", dimension: "焦虑" },
    { id: 76, text: "别人对您的成绩没有作出恰当的评价", dimension: "偏执" },
    { id: 77, text: "即使和别人在一起也感到孤单", dimension: "人际关系敏感" },
    { id: 78, text: "感到坐立不安心神不定", dimension: "焦虑" },
    { id: 79, text: "感到自己没有什么价值", dimension: "抑郁" },
    { id: 80, text: "感到熟悉的东西变成陌生或不真实", dimension: "精神病性" },
    { id: 81, text: "大叫或摔东西", dimension: "敌对" },
    { id: 82, text: "害怕会在公共场合昏倒", dimension: "恐怖" },
    { id: 83, text: "感到别人想占您的便宜", dimension: "偏执" },
    { id: 84, text: "为一些有关性的想法而很苦恼", dimension: "精神病性" },
    { id: 85, text: "您认为应该因为自己的过错而受到惩罚", dimension: "精神病性" },
    { id: 86, text: "感到要赶快把事情做完", dimension: "强迫症状" },
    { id: 87, text: "感到自己的身体有严重问题", dimension: "躯体化" },
    { id: 88, text: "从未感到和其他人很亲近", dimension: "人际关系敏感" },
    { id: 89, text: "感到内疚", dimension: "抑郁" },
    { id: 90, text: "认为自己的脑子有毛病", dimension: "精神病性" }
  ];

  return new Response(JSON.stringify({ success: true, data: questions }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * 获取请求的 origin
 */
function urlOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
