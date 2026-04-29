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
 * POST /api/agent/plan_async
 * 异步生成旅行规划 - 立即返回 task_id，后台处理
 * 需要 JWT 认证
 */
router.post('/plan_async', authMiddleware, async (req, res, next) => {
  try {
    // 验证请求参数
    const params = validatePlanParams(req.body);
    const { city, startTime, endTime, preferences } = params;
    const userId = req.userId;

    // 立即创建 pending 状态的历史记录
    const historyId = agentService.saveTripHistory({
      userId,
      city,
      startTime,
      endTime,
      preferences,
      status: 'pending',
    });

    // 立即返回 task_id
    res.json({
      success: true,
      data: {
        id: historyId,
        status: 'pending',
      },
    });

    // 后台异步执行规划
    setImmediate(async () => {
      try {
        // 更新状态为 processing
        agentService.updateTripHistory(historyId, 'processing');

        // 调用 Agent 服务生成规划
        const result = await agentService.generatePlan({
          city,
          startTime,
          endTime,
          preferences,
          userId,
        });

        // 更新状态为 completed
        agentService.updateTripHistory(historyId, 'completed', result);
      } catch (error) {
        console.error('[plan_async] Background task failed:', error);
        // 更新状态为 failed
        agentService.updateTripHistory(historyId, 'failed');
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agent/task/:taskId
 * 获取任务状态和结果
 * 需要 JWT 认证
 */
router.get('/task/:taskId', authMiddleware, async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const userId = req.userId;

    const db = require('../db');
    const records = db.query(
      'SELECT * FROM trip_history WHERE id = ? AND user_id = ?',
      [taskId, userId]
    );

    if (records.length === 0) {
      throw createError.notFound('任务不存在');
    }

    const record = records[0];
    const result = {
      id: record.id,
      city: record.city,
      startTime: record.start_time,
      endTime: record.end_time,
      preferences: JSON.parse(record.preferences),
      result: record.result ? JSON.parse(record.result) : null,
      status: record.status,
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

/**
 * DELETE /api/agent/history/:id
 * 删除单条规划历史
 * 需要 JWT 认证
 */
router.delete('/history/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const db = require('../db');
    const result = db.query(
      'DELETE FROM trip_history WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agent/plan_test
 * 测试用规划接口 - 直接返回固定结构化结果，不经过 Agent
 */
router.post('/plan_test', authMiddleware, async (req, res, next) => {
  try {
    const { city, startTime, endTime, preferences } = req.body;
    const userId = req.userId;

    const testResult = {
      routes: [
        {
          name: '北京动物园',
          location: '西直门外大街137号',
          time: '第二天（4月30日）09:00 — 10:30',
          rating: '4.8',
          duration: '约1.5小时',
          description: '**📍 北京动物园**  \n' +
            '- **地址**：西直门外大街137号  \n' +
            '- **评分**：⭐ 4.8 | **类型**：动物园  \n' +
            '- **推荐理由**：中国最大、最悠久的动物园之一，动物种类丰富，有熊猫馆、猴山、狮虎山等，孩子超喜欢！  \n' +
            '- **票价**：旺季门票约15元，联票（含熊猫馆）约19元',
          reason: '中国最大、最悠久的动物园之一，动物种类丰富，有熊猫馆、猴山、狮虎山等，孩子超喜欢！',
          transport: '起始点'
        },
        {
          name: '北京海洋馆',
          location: '气象路6号（动物园北门内）',
          time: '第二天（4月30日）10:30 — 12:00',
          rating: '4.6',
          duration: '约1.5小时',
          description: '**📍 北京海洋馆**（与动物园紧邻）  \n' +
            '- **地址**：气象路6号（动物园北门内）  \n' +
            '- **评分**：⭐ 4.6 | **类型**：水族馆  \n' +
            '- **推荐理由**：大型室内海洋馆，有海豚表演、海底隧道，互动性强，非常适合亲子家庭  \n' +
            '- **票价**：约160元（含动物园门票）  \n' +
            '> 🚶 **两个景点紧邻**，步行即可到达，非常方便！',
          reason: '大型室内海洋馆，有海豚表演、海底隧道，互动性强，非常适合亲子家庭',
          transport: '步行（与动物园紧邻）'
        },
        {
          name: '中国科学技术馆',
          location: '北辰东路5号（奥林匹克公园内）',
          time: '第二天（4月30日）13:30 — 17:00',
          rating: '4.9',
          duration: '约3.5小时',
          description: '**📍 中国科学技术馆**  \n' +
            '- **地址**：北辰东路5号（奥林匹克公园内）  \n' +
            '- **评分**：⭐ 4.9 | **类型**：科技馆  \n' +
            '- **推荐理由**：  \n' +
            '  ✅ 儿童科学乐园（适合3-8岁）—— 互动体验超多  \n' +
            '  ✅ 华夏之光、探索与发现等展厅  \n' +
            '  ✅ 球幕影院、巨幕影院，震撼视听体验  \n' +
            '  ✅ 安全、教育性强，寓教于乐  \n' +
            '- **票价**：主展厅30元，儿童科学乐园30元，球幕影院30元',
          reason: '儿童科学乐园互动体验超多，球幕影院震撼，寓教于乐',
          transport: '地铁4号线 → 海淀黄庄换乘10号线 → 北土城换乘8号线 → 奥林匹克公园站下车，全程约50分钟'
        }
      ],
      summary: '这是一份为期约1天的北京亲子游规划，覆盖4月29日下午至4月30日下午。行程包括抵达入住、晚餐，以及第二天游览北京动物园、北京海洋馆和中国科学技术馆，所有景点均为儿童友好、互动性强、安全优先的经典亲子场所。'
    };

    // 生成假的历史ID
    const historyId = require('crypto').randomUUID();

    res.json({
      success: true,
      data: {
        id: historyId,
        city: city || 'beijing',
        startTime: startTime || new Date().toISOString(),
        endTime: endTime || new Date().toISOString(),
        result: testResult,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;