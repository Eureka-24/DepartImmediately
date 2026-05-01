-- Wayfinder Database Schema
-- PostgreSQL 16 + pgvector

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    city TEXT,
    start_time TEXT,
    end_time TEXT,
    preferences TEXT,
    result TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table (async task queue)
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    input JSONB NOT NULL,
    result JSONB,
    error TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);

-- User preferences table (with vector embedding)
-- Vector dimension: 1024 (Zhipu AI embedding-3)
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    preference_text TEXT NOT NULL,
    preference_vector VECTOR(1024),
    source TEXT DEFAULT 'input',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_prefs_user_created ON user_preferences(user_id, created_at);
-- Vector index for cosine similarity search (IVFFlat)
CREATE INDEX IF NOT EXISTS idx_user_prefs_vector ON user_preferences USING ivfflat (preference_vector cosine_ops);