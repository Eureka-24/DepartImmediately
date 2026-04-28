/**
 * Planning Agent 服务
 * 使用 LangGraph Prebuilt ReAct Agent 进行旅行规划
 */

const { createReactAgent } = require('@langchain/langgraph/prebuilt');
const { createPlanningLLM } = require('../config/llm');
const { tools } = require('./tools');
const { searchPois, filterAndRankPois } = require('./tools/searchPois');
const { defaultPopularRoute } = require('../config/prompts');

/**
 * Planning Agent 系统提示词
 */
const PLANNING_SYSTEM_PROMPT = `你是一位专业的旅行规划师，擅长根据用户需求规划个性化旅行路线。

【核心能力】
1. 理解用户模糊需求（如"亲子游"、"吃货"、"不想排队"）
2. 搜索合适的 POI 地点
3. 规划合理的路线顺序
4. 计算预估时间，确保符合用户时间范围
5. 生成详细的行程安排

【工具使用】
你可以使用以下工具来辅助规划：
- search_pois: 搜索城市中的POI地点
- route_planning: 计算两个地点之间的路线和时间
- get_user_preferences: 获取用户历史偏好（如有）

【API 限流处理 - 重要】
高德地图 API 有严格的并发和频率限制。当调用 search_pois 或 route_planning 时：
- 如果返回错误信息包含 "CUQPS"、"CUQPS_HAS_EXCEEDED"、"rate limit"、"频率" 等关键词，说明触发了限流
- 一旦检测到限流错误，必须立即停止当前 API 调用
- 不要再重试调用当前调用的工具
- 直接使用当前已有的 POI 数据进入下一步骤进行规划

【规划原则】
1. 优先考虑用户明确提出的需求
2. 结合用户历史偏好进行个性化推荐
3. 确保路线时间逻辑合理（不在时间范围外）
4. 景点之间距离适中，避免过长途程
5. 提供备选方案

【输出格式】
你必须以 JSON 格式返回最终规划结果：
{
  "routes": [{
    "pois": [{
      "name": "景点名",
      "location": "lng,lat",
      "arrival": "09:30",
      "duration": 120,
      "transport": "步行",
      "reason": "推荐理由"
    }],
    "totalDuration": 480,
    "score": 0.95,
    "summary": "路线总结"
  }],
  "alternatives": []
}

【约束】
- 每个 POI 停留时间默认 60-180 分钟
- 出行时间超过 30 分钟需注明交通方式
- 总时长不能超过用户指定的时间范围
- 必须实际调用工具获取 POI 数据，不要编造景点信息（限流情况下除外）`;

/**
 * Planning Agent 类
 */
class PlanningAgent {
  constructor() {
    this.llm = createPlanningLLM();
    this.agent = createReactAgent({
      llm: this.llm,
      tools,
      stateModifier: PLANNING_SYSTEM_PROMPT,
    });
  }

  /**
   * 生成旅行规划
   * @param {Object} params - 输入参数
   * @param {Object} params.intent - Intent Agent 输出的结构化意图
   * @param {Array} params.pois - 已搜索的 POI 列表（可选）
   * @param {string} params.userId - 用户ID（可选）
   * @returns {Promise<Object>} 规划结果
   */
  async generatePlan({ intent, pois = [], userId = null }) {
    const { city, startTime, endTime, duration, interests, travelStyle, specialRequirements } = intent;

    // 构建用户消息
    const userMessage = this.buildUserMessage({
      city,
      startTime,
      endTime,
      duration,
      interests,
      travelStyle,
      specialRequirements,
      pois,
      userId,
    });

    try {
      console.log('[Planning Agent] 开始规划...');

      // 调用 ReAct Agent
      const response = await this.agent.invoke({
        messages: [{ role: 'user', content: userMessage }],
      });

      // 从响应中提取最终结果
      const result = this.extractResult(response);

      console.log('[Planning Agent] 规划完成');
      return result;
    } catch (error) {
      console.error('[Planning Agent] 规划失败:', error.message);

      // 降级处理
      return this.getFallbackResult(pois, city);
    }
  }

  /**
   * 构建用户消息
   */
  buildUserMessage({ city, startTime, endTime, duration, interests, travelStyle, specialRequirements, pois, userId }) {
    const days = Math.ceil(duration / (60 * 24));
    const hours = Math.round(duration / 60);

    let message = `请为以下旅行需求生成规划：

【基本信息】
城市: ${city}
时间范围: ${startTime} - ${endTime}
旅行时长: 约 ${days} 天 ${hours % 24} 小时

【用户偏好】
兴趣关键词: ${interests?.join(', ') || '景点,热门'}
旅行风格: ${travelStyle || '休闲'}
`;

    if (specialRequirements && specialRequirements.length > 0) {
      message += `特殊需求: ${specialRequirements.join(', ')}\n`;
    }

    if (userId) {
      message += `\n用户ID: ${userId}（可通过 get_user_preferences 工具获取用户历史偏好）`;
    }

    if (pois && pois.length > 0) {
      message += `\n\n【已搜索的 POI】（共 ${pois.length} 个）\n`;
      pois.forEach((poi, idx) => {
        message += `${idx + 1}. ${poi.name} - 类型: ${poi.type || '景点'}, 评分: ${poi.rating || 'N/A'}\n`;
      });
      message += `\n请从上述 POI 中选择合适的景点进行路线规划。`;
    } else {
      message += `\n\n请首先调用 search_pois 搜索相关的 POI 地点，然后再进行路线规划。`;
    }

    return message;
  }

  /**
   * 从 Agent 响应中提取结果
   */
  extractResult(response) {
    const messages = response.messages || [];
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || !lastMessage.content) {
      console.error('[Planning Agent] 无法从响应中提取结果');
      return defaultPopularRoute;
    }

    const content = lastMessage.content;
    console.log('[Planning Agent] LLM 输出预览:', content.substring(0, 300));

    try {
      // 尝试解析 JSON
      let result;

      // 尝试提取 JSON 块
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        content.match(/```\s*([\s\S]*?)\s*```/) ||
                        content.match(/(\{[\s\S]*\})/);

      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        result = JSON.parse(content);
      }

      // 验证结果格式
      if (!result.routes || !Array.isArray(result.routes)) {
        console.warn('[Planning Agent] 结果格式异常，使用默认路线');
        return defaultPopularRoute;
      }

      return result;
    } catch (e) {
      console.error('[Planning Agent] JSON 解析失败:', e.message);
      console.error('[Planning Agent] 原始内容:', content);

      // 尝试从内容中提取信息手动构建结果
      return this.extractManualResult(content);
    }
  }

  /**
   * 从原始文本中手动提取结果
   */
  extractManualResult(content) {
    // 简单的文本解析作为降级
    return {
      routes: [{
        pois: [{
          name: '规划结果解析失败',
          arrival: '09:00',
          duration: 120,
          transport: '步行',
          reason: '请稍后重试',
        }],
        totalDuration: 120,
        score: 0.3,
        summary: content.substring(0, 100),
      }],
      alternatives: [],
    };
  }

  /**
   * 获取降级结果
   */
  getFallbackResult(pois, city) {
    if (pois && pois.length > 0) {
      return {
        routes: [{
          pois: pois.slice(0, 5).map((p, idx) => ({
            name: p.name,
            location: p.location,
            arrival: `${9 + idx * 2}:00`,
            duration: 120,
            transport: '步行',
            reason: '推荐景点',
          })),
          totalDuration: 480,
          score: 0.5,
          summary: `基于 ${city} 的热门景点生成的推荐路线`,
        }],
        alternatives: [],
      };
    }

    return defaultPopularRoute;
  }
}

// 导出单例
const planningAgent = new PlanningAgent();

module.exports = planningAgent;