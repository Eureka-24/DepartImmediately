-- 智能路线规划系统数据库 Schema
-- 版本: v1.0
-- 日期: 2026-04-27

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 用户偏好表
CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    favorite_cities TEXT,
    favorite_types TEXT,
    travel_style TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 历史规划表
CREATE TABLE IF NOT EXISTS trip_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    city TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    preferences TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_history_user_id ON trip_history(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_history_created_at ON trip_history(created_at);
