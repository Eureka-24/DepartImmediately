/**
 * AI Agent 核心服务
 * 串联 Intent Agent + Planning Agent，实现双 Agent 架构
 */

const intentAgent = require('./intentAgent');
const planningAgent = require('./planningAgent');
const { getUserPreferences } = require('./tools/userPrefs');
const { searchPois, filterAndRankPois } = require('./tools/searchPois');
const { defaultPopularRoute } = require('../config/prompts');
const db = require('../db');
const crypto = require('crypto');

/**
 * 生成旅行规划
 * 实现双 Agent 工作流：
 * 1. Intent Agent: 理解意图，生成结构化意图数据
 * 2. Planning Agent: 根据意图调用高德 API 搜索 POI 和路径规划，生成最终路线
 *
 * @param {Object} params - 规划参数
 * @param {string} params.city - 城市名称
 * @param {string} params.startTime - 开始时间
 * @param {string} params.endTime - 结束时间
 * @param {string} params.preferences - 用户偏好描述
 * @param {string} params.userId - 用户ID（可选）
 * @returns {Promise<Object>} 规划结果
 */
async function generatePlan({ city, startTime, endTime, preferences, userId }) {
  try {
    // ========================================
    // Step 1: 获取用户历史偏好
    // ========================================
    let userPreferences = {
      favoriteCities: [],
      favoriteTypes: [],
      travelStyle: '',
    };

    if (userId) {
      try {
        userPreferences = await getUserPreferences(userId);
      } catch (e) {
        console.warn('[Agent Service] 获取用户偏好失败:', e.message);
      }
    }

    // ========================================
    // Step 2: Intent Agent - 理解用户意图
    // ========================================
    console.log('[Agent Service] Step 2: Intent Agent 处理中...');

    const intent = await intentAgent.parseIntent({
      city,
      startTime,
      endTime,
      preferences,
      userPreferences,
    });

    console.log('[Agent Service] Intent 解析结果:', JSON.stringify(intent, null, 2));

    // ========================================
    // Step 3: 预搜索 POI（为 Planning Agent 提供候选）
    // ========================================
    console.log('[Agent Service] Step 3: 搜索 POI 候选...');

    const keywords = intent.interests?.join(',') || intent.suggestedPoiTypes?.join(',') || '景点,热门';
    let candidatePois = [];

    try {
      const pois = await searchPois(city, keywords);
      candidatePois = filterAndRankPois(pois, {
        maxResults: 10,
        preferTypes: intent.interests,
        avoidTypes: intent.specialRequirements,
      });
      console.log('[Agent Service] 找到', candidatePois.length, '个候选 POI');
    } catch (e) {
      console.warn('[Agent Service] POI 搜索失败:', e.message);
    }

    // ========================================
    // Step 4: Planning Agent - 生成旅行规划
    // ========================================
    console.log('[Agent Service] Step 4: Planning Agent 生成规划...');

    const planResult = await planningAgent.generatePlan({
      intent,
      pois: candidatePois,
      userId,
    });

    console.log('[Agent Service] Planning 完成');

    // ========================================
    // Step 5: 后处理 - 添加 POI 位置信息
    // ========================================
    if (planResult.routes && candidatePois.length > 0) {
      planResult.routes.forEach(route => {
        if (route.pois) {
          route.pois.forEach(poi => {
            // 尝试匹配 POI 位置
            const matchedPoi = candidatePois.find(p =>
              p.name === poi.name || p.name.includes(poi.name) || poi.name.includes(p.name)
            );
            if (matchedPoi && matchedPoi.location) {
              poi.location = matchedPoi.location;
            }
          });
        }
      });
    }

    return planResult;
  } catch (error) {
    console.error('[Agent Service] 生成规划失败:', error);

    // 降级处理
    return {
      ...defaultPopularRoute,
      message: `规划过程中出现问题，返回默认路线: ${error.message}`,
    };
  }
}

/**
 * 保存规划历史
 * @param {Object} params - 规划参数和结果
 * @returns {string} 历史记录 ID
 */
function saveTripHistory({ userId, city, startTime, endTime, preferences, result }) {
  const id = crypto.randomUUID();
  const resultJson = JSON.stringify(result);
  const preferencesJson = JSON.stringify(preferences);

  db.run(
    `INSERT INTO trip_history (id, user_id, city, start_time, end_time, preferences, result)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, city, startTime, endTime, preferencesJson, resultJson]
  );

  return id;
}

/**
 * 获取用户规划历史
 * @param {string} userId - 用户ID
 * @param {number} limit - 返回数量限制
 * @returns {Array} 历史记录数组
 */
function getTripHistory(userId, limit = 10) {
  const records = db.query(
    `SELECT * FROM trip_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, limit]
  );

  return records.map(record => {
    let parsedPreferences = record.preferences;
    try {
      parsedPreferences = JSON.parse(record.preferences);
    } catch (e) {
      // 如果解析失败，可能是旧数据（直接存储的字符串），直接使用原值
    }
    return {
      id: record.id,
      city: record.city,
      startTime: record.start_time,
      endTime: record.end_time,
      preferences: parsedPreferences,
      result: JSON.parse(record.result),
      createdAt: record.created_at,
    };
  });
}

module.exports = {
  generatePlan,
  saveTripHistory,
  getTripHistory,
};