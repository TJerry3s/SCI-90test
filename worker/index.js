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
  if (user.DEVICE_ID && user.DEVICE_ID !== deviceId) {
    return new Response(JSON.stringify({
      error: '此链接已在其他设备使用，请联系客服',
      code: 'DEVICE_MISMATCH'
    }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 首次访问，绑定设备
  if (!user.DEVICE_ID) {
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

  if (user.DEVICE_ID !== deviceId) {
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
    'SELECT token, order_id, note, status, created_at, first_access_at, progress FROM users ORDER BY created_at DESC'
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

  if (user.DEVICE_ID !== deviceId) {
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
 * 获取请求的 origin
 */
function urlOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
