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
-- task_id added for linking preferences to specific tasks
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    task_id VARCHAR(64),
    preference_text VARCHAR(255) NOT NULL,
    preference_vector JSONB,
    source TEXT DEFAULT 'input',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_prefs_user_created ON user_preferences(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_prefs_task_id ON user_preferences(task_id);
-- Vector index for cosine similarity search (IVFFlat)
CREATE INDEX IF NOT EXISTS idx_user_prefs_vector ON user_preferences USING ivfflat (preference_vector jsonb_vector_ops);

-- Standard preference library table (semantic extension)
CREATE TABLE IF NOT EXISTS preference_lib (
    id SERIAL PRIMARY KEY,
    tag VARCHAR(64) NOT NULL UNIQUE,
    description TEXT,
    synonyms TEXT,
    embedding_vector JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_preference_lib_embedding ON preference_lib USING ivfflat (embedding_vector jsonb_vector_ops);