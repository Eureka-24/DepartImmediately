/**
 * 认证路由模块
 * 处理用户注册、登录、个人信息等 API
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { AppError, createError } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * 生成 UUID
 */
function generateId() {
  return crypto.randomUUID();
}

/**
 * 验证邮箱格式
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * POST /api/auth/register
 * 用户注册
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 验证必填字段
    if (!email || !password) {
      throw createError.badRequest('邮箱和密码不能为空');
    }

    // 验证邮箱格式
    if (!isValidEmail(email)) {
      throw createError.badRequest('邮箱格式无效');
    }

    // 验证密码长度
    if (password.length < 6) {
      throw createError.badRequest('密码长度至少为 6 个字符');
    }

    // 检查邮箱是否已存在
    const existingUsers = db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      throw createError.badRequest('该邮箱已被注册');
    }

    // 密码加密
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const userId = generateId();
    db.run(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      [userId, email, passwordHash]
    );

    // 创建用户偏好记录
    const prefId = generateId();
    db.run(
      'INSERT INTO user_preferences (id, user_id) VALUES (?, ?)',
      [prefId, userId]
    );

    // 生成 JWT token
    const token = jwt.sign(
      { userId, email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // 返回成功响应
    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: userId,
          email,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 验证必填字段
    if (!email || !password) {
      throw createError.badRequest('邮箱和密码不能为空');
    }

    // 查找用户
    const users = db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      throw createError.unauthorized('邮箱或密码错误');
    }

    const user = users[0];

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw createError.unauthorized('邮箱或密码错误');
    }

    // 生成 JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // 返回成功响应
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/profile
 * 获取用户信息（需认证）
 */
router.get('/profile', authMiddleware, (req, res, next) => {
  try {
    const users = db.query(
      'SELECT id, email, created_at FROM users WHERE id = ?',
      [req.userId]
    );

    if (users.length === 0) {
      throw createError.notFound('用户不存在');
    }

    const user = users[0];

    // 获取用户偏好
    const preferences = db.query(
      'SELECT * FROM user_preferences WHERE user_id = ?',
      [req.userId]
    );

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        preferences: preferences.length > 0 ? {
          favoriteCities: preferences[0].favorite_cities ? JSON.parse(preferences[0].favorite_cities) : [],
          favoriteTypes: preferences[0].favorite_types ? JSON.parse(preferences[0].favorite_types) : [],
          travelStyle: preferences[0].travel_style || '',
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/auth/preferences
 * 更新用户偏好（需认证）
 */
router.put('/preferences', authMiddleware, (req, res, next) => {
  try {
    const { favoriteCities, favoriteTypes, travelStyle } = req.body;

    // 获取现有偏好
    const preferences = db.query(
      'SELECT id FROM user_preferences WHERE user_id = ?',
      [req.userId]
    );

    if (preferences.length === 0) {
      throw createError.notFound('用户偏好记录不存在');
    }

    const prefId = preferences[0].id;

    // 更新偏好
    db.run(
      `UPDATE user_preferences
       SET favorite_cities = ?, favorite_types = ?, travel_style = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        favoriteCities ? JSON.stringify(favoriteCities) : null,
        favoriteTypes ? JSON.stringify(favoriteTypes) : null,
        travelStyle || null,
        prefId,
      ]
    );

    // 返回更新后的偏好
    res.json({
      success: true,
      data: {
        favoriteCities: favoriteCities || [],
        favoriteTypes: favoriteTypes || [],
        travelStyle: travelStyle || '',
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;