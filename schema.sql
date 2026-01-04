-- SCI-90 测试系统数据库表结构
-- Cloudflare D1 数据库

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  token TEXT PRIMARY KEY,              -- 唯一 token（链接中使用）
  order_id TEXT NOT NULL,              -- 小红书订单号
  note TEXT,                           -- 备注
  status TEXT DEFAULT 'pending',       -- 状态: pending(待测试) | testing(测试中) | completed(已完成)

  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,    -- 创建时间
  first_access_at DATETIME,                         -- 首次访问时间
  completed_at DATETIME,                            -- 完成时间

  -- 设备绑定
  device_id TEXT,                                   -- 设备指纹（首次访问的设备）

  -- 测试数据
  progress INTEGER DEFAULT 0,                        -- 当前进度 (0-90)
  answers TEXT,                                      -- 答案 (JSON 格式)
  result TEXT                                        -- 结果 (JSON 格式)
);

-- 管理员表（可选，用于后续扩展）
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  password TEXT NOT NULL,               -- 管理员密码
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_users_order_id ON users(order_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);
