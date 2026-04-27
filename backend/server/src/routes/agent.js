/**
 * AI Agent 路由
 * 处理旅行规划相关的 API 请求
 */

const express = require('express');
const authMiddleware = require('../middleware/auth');
const { createError } = require('../middleware/errorHandler');
const agentService = require('../services/agentService');

const router = express.Router();

/**
 * 验证规划请求参数
 * @param {Object} body - 请求体
 * @returns {Object} 验证后的参数
 */
function validatePlanParams(body) {
  const { city, startTime, endTime, preferences } = body;

  if (!city || typeof city !== 'string') {
    throw createError.badRequest('城市不能为空');
  }

  if (!startTime) {
    throw createError.badRequest('开始时间不能为空');
  }

  if (!endTime) {
    throw createError.badRequest('结束时间不能为空');
  }

  // 验证时间范围
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime())) {
    throw createError.badRequest('开始时间格式无效');
  }

  if (isNaN(end.getTime())) {
    throw createError.badRequest('结束时间格式无效');
  }

  if (start >= end) {
    throw createError.badRequest('结束时间必须晚于开始时间');
  }

  return {
    city: city.trim(),
    startTime,
    endTime,
    preferences: preferences || '',
  };
}

/**
 * POST /api/agent/plan
 * 生成旅行规划
 * 需要 JWT 认证
 */
router.post('/plan', authMiddleware, async (req, res, next) => {
  try {
    // 验证请求参数
    const params = validatePlanParams(req.body);
    const { city, startTime, endTime, preferences } = params;
    const userId = req.userId;

    // 调用 Agent 服务生成规划
    const result = await agentService.generatePlan({
      city,
      startTime,
      endTime,
      preferences,
      userId,
    });

    // 保存到历史记录
    const historyId = agentService.saveTripHistory({
      userId,
      city,
      startTime,
      endTime,
      preferences,
      result,
    });

    // 返回结果
    res.json({
      success: true,
      data: {
        id: historyId,
        city,
        startTime,
        endTime,
        result,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agent/history
 * 获取用户的规划历史
 * 需要 JWT 认证
 */
router.get('/history', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 10;

    const history = agentService.getTripHistory(userId, limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agent/history/:id
 * 获取单条规划历史详情
 * 需要 JWT 认证
 */
router.get('/history/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const db = require('../db');
    const records = db.query(
      'SELECT * FROM trip_history WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (records.length === 0) {
      throw createError.notFound('规划记录不存在');
    }

    const record = records[0];
    const result = {
      id: record.id,
      city: record.city,
      startTime: record.start_time,
      endTime: record.end_time,
      preferences: JSON.parse(record.preferences),
      result: JSON.parse(record.result),
      createdAt: record.created_at,
    };

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;