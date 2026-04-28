/**
 * Intent Agent 服务
 * 使用 LangChain LLM + JSON 解析进行意图识别
 */

const { createIntentLLM } = require('../config/llm');
const { extractPreferenceKeywords } = require('./tools/userPrefs');

/**
 * Intent Agent 类
 */
class IntentAgent {
  constructor() {
    this.llm = createIntentLLM();
  }

  /**
   * 解析用户意图
   * @param {Object} params - 输入参数
   * @param {string} params.city - 城市
   * @param {string} params.startTime - 开始时间
   * @param {string} params.endTime - 结束时间
   * @param {string} params.preferences - 用户偏好描述
   * @param {Object} params.userPreferences - 用户历史偏好（可选）
   * @returns {Promise<Object>} 结构化意图
   */
  async parseIntent({ city, startTime, endTime, preferences, userPreferences = {} }) {
    // 计算时长
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMinutes = Math.round((end - start) / (1000 * 60));

    // 构建提示词
    const prompt = this.buildPrompt({
      city,
      startTime,
      endTime,
      durationMinutes,
      preferences,
      userPreferences,
    });

    try {
      // 调用 LangChain LLM
      const response = await this.llm.invoke(prompt);
      const content = response.content;

      console.log('[Intent Agent] LLM 输出:', content);

      // 解析 JSON
      const intent = this.parseJsonResponse(content, {
        city,
        startTime,
        endTime,
        durationMinutes,
        preferences,
      });

      console.log('[Intent Agent] 解析结果:', JSON.stringify(intent, null, 2));

      return intent;
    } catch (error) {
      console.error('[Intent Agent] 解析失败:', error.message);

      // 降级处理：返回默认意图
      return this.getDefaultIntent({
        city,
        startTime,
        endTime,
        durationMinutes,
        preferences,
      });
    }
  }

  /**
   * 构建提示词
   */
  buildPrompt({ city, startTime, endTime, durationMinutes, preferences, userPreferences }) {
    const days = Math.ceil(durationMinutes / (60 * 24));
    const hours = Math.round(durationMinutes / 60);

    // 从用户输入中快速提取关键词（备用）
    const quickExtract = extractPreferenceKeywords(userPreferences, preferences);

    return `你是一位专业的旅行规划意图识别专家。请从用户的旅行需求描述中提取结构化信息。

【用户输入】
城市: ${city}
开始时间: ${startTime}
结束时间: ${endTime}
旅行时长: 约 ${days} 天 ${hours % 24} 小时
用户偏好描述: ${preferences || '无'}

【用户历史偏好】（如有）
喜欢的城市: ${userPreferences.favoriteCities?.join(', ') || '无'}
喜欢的类型: ${userPreferences.favoriteTypes?.join(', ') || '无'}
旅行风格: ${userPreferences.travelStyle || '无'}

【你的任务】
1. 解析用户输入，提取关键信息
2. 识别用户可能的兴趣点（如亲子游、美食、文化等）
3. 识别特殊需求（如不想排队、避开高峰等）
4. 推断预算等级
5. 建议合适的 POI 类型

【输出格式】
请以以下 JSON 格式返回（只返回 JSON，不要其他内容）：
{
  "city": "城市名称",
  "interests": ["关键词1", "关键词2"],
  "travelStyle": "亲子/休闲/美食/文化/购物/拍照",
  "budget": "经济/中等/奢侈",
  "specialRequirements": ["特殊需求1", "特殊需求2"],
  "suggestedPoiTypes": ["景点", "美食"]
}`;
  }

  /**
   * 解析 JSON 响应
   */
  parseJsonResponse(content, defaults) {
    try {
      // 尝试提取 JSON 块
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        content.match(/```\s*([\s\S]*?)\s*```/) ||
                        content.match(/(\{[\s\S]*\})/);

      let jsonStr = content;
      if (jsonMatch) {
        jsonStr = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr);

      // 合并默认参数
      return {
        city: defaults.city,
        startTime: defaults.startTime,
        endTime: defaults.endTime,
        duration: defaults.durationMinutes,
        interests: Array.isArray(parsed.interests) ? parsed.interests : defaults.preferences?.split(',').map(s => s.trim()) || ['景点'],
        travelStyle: parsed.travelStyle || '休闲',
        budget: parsed.budget || '中等',
        specialRequirements: Array.isArray(parsed.specialRequirements) ? parsed.specialRequirements : [],
        suggestedPoiTypes: Array.isArray(parsed.suggestedPoiTypes) ? parsed.suggestedPoiTypes : ['景点', '美食'],
      };
    } catch (e) {
      console.error('[Intent Agent] JSON 解析失败:', e.message);

      // 使用快速提取作为降级
      const quickExtract = extractPreferenceKeywords({}, defaults.preferences);

      return {
        city: defaults.city,
        startTime: defaults.startTime,
        endTime: defaults.endTime,
        duration: defaults.durationMinutes,
        interests: quickExtract.keywords,
        travelStyle: quickExtract.travelStyle || '休闲',
        budget: '中等',
        specialRequirements: quickExtract.avoidTypes,
        suggestedPoiTypes: ['景点', '美食'],
      };
    }
  }

  /**
   * 获取默认意图（降级方案）
   */
  getDefaultIntent({ city, startTime, endTime, durationMinutes, preferences }) {
    const quickExtract = extractPreferenceKeywords({}, preferences);

    return {
      city,
      startTime,
      endTime,
      duration: durationMinutes,
      interests: quickExtract.keywords,
      travelStyle: quickExtract.travelStyle || '休闲',
      budget: '中等',
      specialRequirements: quickExtract.avoidTypes,
      suggestedPoiTypes: ['景点', '美食'],
    };
  }
}

// 导出单例
const intentAgent = new IntentAgent();

module.exports = intentAgent;