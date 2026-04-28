/**
 * Structured Agent 服务
 * 负责将 Planning Agent 的 Markdown 输出转换为标准 JSON 结构
 */

const { createStructuredLLM } = require('../config/llm');
const { structuredAgentPrompt, defaultPopularRoute } = require('../config/prompts');

/**
 * Structured Agent 类
 * 接收 Markdown 格式的旅行规划，输出 JSON 格式的结构化结果
 */
class StructuredAgent {
  constructor() {
    this.llm = createStructuredLLM();
    this.maxRetries = 1;
  }

  /**
   * 解析 Markdown 旅行规划为 JSON 结构
   * @param {string} markdownText - Planning Agent 输出的 Markdown 文本
   * @returns {Promise<Object>} 标准 JSON 结构
   */
  async parse(markdownText) {
    if (!markdownText || typeof markdownText !== 'string') {
      console.warn('[Structured Agent] 输入为空或无效');
      return this.getErrorResult('输入为空');
    }

    console.log('[Structured Agent] 开始解析 Markdown...');
    console.log('[Structured Agent] 输入预览:', markdownText.substring(0, 200));

    try {
      const result = await this.parseWithLLM(markdownText);

      // 验证结果
      if (this.validateResult(result)) {
        console.log('[Structured Agent] 解析成功');
        console.log(result);
        return result;
      } else {
        console.warn('[Structured Agent] 结果格式验证失败');
        return this.getErrorResult('结果格式验证失败', markdownText);
      }
    } catch (error) {
      console.error('[Structured Agent] 解析失败:', error.message);

      // 重试一次
      return this.retryWithRetryPrompt(markdownText);
    }
  }

  /**
   * 使用 LLM 解析 Markdown
   */
  async parseWithLLM(markdownText) {
    const prompt = structuredAgentPrompt.replace('{input}', markdownText);

    const response = await this.llm.invoke(prompt);

    const content = response.content || '';

    // 提取 JSON
    return this.extractJson(content);
  }

  /**
   * 从 LLM 输出中提取 JSON
   */
  extractJson(content) {
    // 尝试多种 JSON 提取方式
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                      content.match(/```\s*([\s\S]*?)\s*```/) ||
                      content.match(/(\{[\s\S]*\})/);

    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch (e) {
        // JSON 解析失败，尝试整个内容
        try {
          return JSON.parse(content);
        } catch (e2) {
          throw new Error('无法解析 JSON');
        }
      }
    }

    // 没有找到 JSON 块，尝试直接解析
    try {
      return JSON.parse(content);
    } catch (e) {
      throw new Error('内容中未找到有效的 JSON');
    }
  }

  /**
   * 使用优化后的 prompt 重试
   */
  async retryWithRetryPrompt(markdownText) {
    console.log('[Structured Agent] 重试中...');

    const retryPrompt = `请将以下旅行规划文本转换为严格的 JSON 格式。

【重要规则】
1. 输出必须是有效的 JSON，不能有任何 Markdown 格式
2. routes 是扁平数组，每个元素是一个 POI
3. 每个 POI 必须包含: name, location, time, rating, duration, description, reason, transport
4. 不要输出任何解释性文字，只输出 JSON

【输入文本】
${markdownText}

【输出格式】
{
  "routes": [
    {
      "name": "景点名称",
      "location": "地址字符串",
      "time": "计划时间",
      "rating": "评分",
      "duration": "时长",
      "description": "Markdown 格式详细描述",
      "reason": "推荐理由",
      "transport": "起始点" 或 "交通方式描述"
    }
  ],
  "summary": "总体描述"
}`;

    try {
      const response = await this.llm.invoke(retryPrompt);
      const content = response.content || '';
      const result = this.extractJson(content);

      if (this.validateResult(result)) {
        console.log('[Structured Agent] 重试解析成功');
        return result;
      }

      throw new Error('重试结果格式仍然无效');
    } catch (error) {
      console.error('[Structured Agent] 重试失败:', error.message);
      return this.getErrorResult('解析失败', markdownText);
    }
  }

  /**
   * 验证结果格式
   * 新格式：扁平 POI 数组，每个 POI 包含 name, location, time, rating, duration, description, reason, transport
   */
  validateResult(result) {
    if (!result || typeof result !== 'object') {
      return false;
    }

    if (!result.routes || !Array.isArray(result.routes)) {
      return false;
    }

    if (result.routes.length === 0) {
      return false;
    }

    // 检查扁平 POI 结构
    for (const poi of result.routes) {
      if (!poi.name || !poi.time) {
        return false;
      }
      // location 可以是空字符串，但必须有此字段
      if (!poi.hasOwnProperty('location')) {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取错误结果（降级 JSON）
   */
  getErrorResult(errorMessage, rawText = '') {
    return {
      routes: [
        {
          name: '规划结果',
          location: '',
          time: '09:00',
          rating: '',
          duration: '约2小时',
          description: 'AI 规划结果解析失败，请稍后重试',
          reason: '解析失败',
          transport: '起始点',
        },
      ],
      summary: errorMessage || '解析失败',
      error: errorMessage,
      rawOutput: rawText ? rawText.substring(0, 500) : '',
    };
  }
}

// 导出单例
const structuredAgent = new StructuredAgent();

module.exports = structuredAgent;