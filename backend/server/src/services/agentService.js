/**
 * AI Agent 核心服务
 * 实现 5 步工作流的 Agent 逻辑
 */

const deepseekClient = require('../utils/deepseek');
const { systemPrompt, defaultPopularRoute } = require('../config/prompts');
const { searchPois, filterAndRankPois } = require('./tools/searchPois');
const { routePlanning } = require('./tools/routePlanning');
const { getUserPreferences, extractPreferenceKeywords } = require('./tools/userPrefs');
const db = require('../db');
const crypto = require('crypto');

/**
 * 生成旅行规划
 * 实现 5 步工作流：
 * 1. 理解意图（解析用户输入）
 * 2. 搜索 POI（调用 search_pois）
 * 3. 路径规划（调用 route_planning）
 * 4. 优化调整（检查时间约束）
 * 5. 生成规划（整合结果）
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
  const context = {
    city,
    startTime,
    endTime,
    preferences,
    userId,
    historyMessages: [],
    pois: [],
    routes: [],
  };

  try {
    // Step 1: 获取用户偏好，理解意图
    let userPreferences = { favoriteCities: [], favoriteTypes: [], travelStyle: '' };
    if (userId) {
      userPreferences = await getUserPreferences(userId);
    }

    // 提取偏好关键词
    const preferenceInfo = extractPreferenceKeywords(userPreferences, preferences);

    // Step 2: 搜索 POI
    const keywords = preferenceInfo.keywords.join(',') || '景点,热门';
    const pois = await searchPois(city, keywords);

    if (pois.length === 0) {
      // 没有搜索结果，返回降级方案
      return {
        ...defaultPopularRoute,
        message: '未找到符合条件的 POI，返回默认热门路线',
      };
    }

    // 筛选候选 POI
    const candidatePois = filterAndRankPois(pois, {
      maxResults: 8,
      preferTypes: preferenceInfo.keywords,
      avoidTypes: preferenceInfo.avoidTypes,
    });

    context.pois = candidatePois;

    // Step 3: 使用 Deepseek Function Calling 进行路径规划
    const planResult = await callDeepseekWithTools(context, preferenceInfo);

    return planResult;
  } catch (error) {
    console.error('生成规划失败:', error);

    // 降级处理：返回默认热门路线
    return {
      ...defaultPopularRoute,
      message: `规划过程中出现问题，返回默认路线: ${error.message}`,
    };
  }
}

/**
 * 调用 Deepseek API 进行 Function Calling
 * @param {Object} context - 上下文信息
 * @param {Object} preferenceInfo - 偏好信息
 * @returns {Promise<Object>} 规划结果
 */
async function callDeepseekWithTools(context, preferenceInfo) {
  // 构建用户请求消息
  const userMessage = buildUserRequestMessage(context, preferenceInfo);

  // 第一次调用 Deepseek
  console.log('[DEBUG] === First Deepseek Call ===');
  console.log('[DEBUG] historyMessages count:', context.historyMessages.length);

  const response = await deepseekClient.chat(
    systemPrompt,
    userMessage,
    context.historyMessages
  );

  const choice = response.choices[0];
  console.log('[DEBUG] First call finish_reason:', choice.finish_reason);
  console.log('[DEBUG] First call has tool_calls:', !!choice.message.tool_calls);

  // 检查是否有工具调用
  if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls) {
    // 处理工具调用
    const toolResults = await handleToolCalls(choice.message.tool_calls, context);

    // 添加 assistant 消息（包含 tool_calls）
    context.historyMessages.push({
      role: 'assistant',
      content: choice.message.content || '',
      tool_calls: choice.message.tool_calls,
    });

    // 添加工具结果 - 每条结果作为单独的 tool 消息
    for (const toolResult of toolResults) {
      context.historyMessages.push({
        role: 'tool',
        tool_call_id: toolResult.tool_call_id,
        content: JSON.stringify(toolResult.result),
      });
    }

    // 第二次调用 Deepseek，传递工具结果
    console.log('[DEBUG] === Second Deepseek Call ===');
    console.log('[DEBUG] historyMessages count:', context.historyMessages.length);

    const secondResponse = await deepseekClient.chat(
      systemPrompt,
      '请根据上述工具调用结果，生成最终的旅行规划。请以指定的 JSON 格式返回。',
      context.historyMessages
    );

    const secondChoice = secondResponse.choices[0];
    console.log('[DEBUG] Second call finish_reason:', secondChoice.finish_reason);
    console.log('[DEBUG] Second call has tool_calls:', !!secondChoice.message.tool_calls);
    console.log('[DEBUG] Second call content preview:', (secondChoice.message.content || '').substring(0, 200));

    // 检查第二次调用是否也需要工具调用
    if (secondChoice.finish_reason === 'tool_calls' || secondChoice.message.tool_calls) {
      // 递归处理（通常不会有第二轮）
      const secondToolResults = await handleToolCalls(secondChoice.message.tool_calls, context);

      context.historyMessages.push({
        role: 'assistant',
        content: secondChoice.message.content || '',
        tool_calls: secondChoice.message.tool_calls,
      });

      for (const toolResult of secondToolResults) {
        context.historyMessages.push({
          role: 'tool',
          tool_call_id: toolResult.tool_call_id,
          content: JSON.stringify(toolResult.result),
        });
      }

      // 第三次调用
      const thirdResponse = await deepseekClient.chat(
        systemPrompt,
        '请根据上述工具调用结果，生成最终的旅行规划。请以指定的 JSON 格式返回。',
        context.historyMessages
      );

      return parseFinalResult(thirdResponse.choices[0], context);
    }

    return parseFinalResult(secondChoice, context);
  }

  // 没有工具调用，直接解析结果
  return parseFinalResult(choice, context);
}

/**
 * 处理工具调用
 * @param {Array} toolCalls - 工具调用数组
 * @param {Object} context - 上下文
 * @returns {Promise<Array>} 工具结果数组
 */
async function handleToolCalls(toolCalls, context) {
  const results = [];

  for (const toolCall of toolCalls) {
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);

    let result;

    switch (functionName) {
      case 'search_pois':
        result = await handleSearchPois(args, context);
        break;
      case 'route_planning':
        result = await handleRoutePlanning(args, context);
        break;
      case 'get_user_preferences':
        result = await handleGetUserPreferences(args);
        break;
      default:
        result = { error: `未知工具: ${functionName}` };
    }

    results.push({
      tool_call_id: toolCall.id,
      function_name: functionName,
      result: result,
    });
  }

  return results;
}

/**
 * 处理 search_pois 工具调用
 */
async function handleSearchPois(args, context) {
  const { city, keywords, type } = args;

  try {
    const pois = await searchPois(city, keywords, type);
    const filteredPois = filterAndRankPois(pois, { maxResults: 8 });

    // 缓存到上下文
    context.pois = filteredPois;

    return {
      success: true,
      pois: filteredPois.slice(0, 5), // 返回最多5个
      total: filteredPois.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 处理 route_planning 工具调用
 */
async function handleRoutePlanning(args, context) {
  const { origin, destination, mode } = args;

  try {
    const route = await routePlanning(origin, destination, mode);
    return {
      success: true,
      ...route,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 处理 get_user_preferences 工具调用
 */
async function handleGetUserPreferences(args) {
  const { user_id } = args;

  try {
    const prefs = await getUserPreferences(user_id);
    return {
      success: true,
      preferences: prefs,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 构建用户请求消息
 */
function buildUserRequestMessage(context, preferenceInfo) {
  const { city, startTime, endTime, preferences, pois } = context;

  // 如果已经有 POI 数据，直接构建消息
  if (pois && pois.length > 0) {
    return `请为以下旅行需求生成规划：

城市: ${city}
时间范围: ${startTime} - ${endTime}
用户偏好: ${preferences}

已搜索到的 POI:
${JSON.stringify(pois.map(p => ({ name: p.name, location: p.location, type: p.type })))}

请结合用户偏好，从上述 POI 中选择合适的景点进行路线规划。`;
  }

  // 否则让 AI 自己调用 search_pois
  return `请为以下旅行需求生成规划：

城市: ${city}
时间范围: ${startTime} - ${endTime}
用户偏好: ${preferences}
旅行风格: ${preferenceInfo.travelStyle}

请首先调用 search_pois 搜索相关 POI，然后进行路线规划。`;
}

/**
 * 解析最终结果
 */
function parseFinalResult(choice, context) {
  const content = choice.message.content || '';
  const finishReason = choice.finish_reason;

  console.log('[DEBUG] parseFinalResult - finish_reason:', finishReason);
  console.log('[DEBUG] parseFinalResult - content length:', content.length);
  console.log('[DEBUG] parseFinalResult - content preview:', content.substring(0, 200));

  // 尝试提取 JSON
  try {
    // 查找 JSON 块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                      content.match(/```\s*([\s\S]*?)\s*```/) ||
                      content.match(/(\{[\s\S]*\})/);

    if (jsonMatch) {
      content = jsonMatch[1] || jsonMatch[0];
      console.log('[DEBUG] JSON extracted from markdown');
    }

    const result = JSON.parse(content);
    console.log('[DEBUG] JSON parsed successfully');

    // 添加 POI 位置信息到结果中
    if (result.routes && context.pois) {
      result.routes.forEach(route => {
        if (route.pois) {
          route.pois.forEach(poi => {
            const matchedPoi = context.pois.find(p => p.name === poi.name);
            if (matchedPoi && matchedPoi.location) {
              poi.location = matchedPoi.location;
            }
          });
        }
      });
    }

    return result;
  } catch (e) {
    // JSON 解析失败，返回降级结果
    console.error('[ERROR] parseFinalResult failed:', e.message);
    console.error('[ERROR] Original content:', content);

    // 返回基于 context.pois 的降级结果
    const pois = context.pois || [];
    return {
      routes: [{
        pois: pois.slice(0, 5).map((p, idx) => ({
          name: p.name,
          arrival: `${9 + idx * 2}:00`,
          duration: 120,
          transport: '步行',
          reason: '推荐景点',
        })),
        totalDuration: 480,
        score: 0.5,
        summary: content ? content.substring(0, 100) : '路线规划完成',
      }],
      alternatives: [],
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

  db.run(
    `INSERT INTO trip_history (id, user_id, city, start_time, end_time, preferences, result)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, city, startTime, endTime, preferences, resultJson]
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

  return records.map(record => ({
    id: record.id,
    city: record.city,
    startTime: record.start_time,
    endTime: record.end_time,
    preferences: JSON.parse(record.preferences),
    result: JSON.parse(record.result),
    createdAt: record.created_at,
  }));
}

module.exports = {
  generatePlan,
  saveTripHistory,
  getTripHistory,
};