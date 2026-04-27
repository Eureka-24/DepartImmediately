/**
 * Deepseek API 封装模块
 * 封装 OpenAI-compatible 接口，支持 Function Calling
 */

const { OpenAI } = require('openai');
const config = require('../config');

/**
 * Deepseek 客户端类
 * 提供 chat completions 和 function calling 支持
 */
class DeepseekClient {
  constructor() {
    this.client = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseURL,
      timeout: 15000, // 15秒超时
    });

    /**
     * 可用工具定义
     * 用于 Function Calling
     */
    this.tools = [
      {
        type: "function",
        function: {
          name: "search_pois",
          description: "搜索城市中的POI地点，如景点、餐厅、酒店等",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string", description: "城市名称" },
              keywords: { type: "string", description: "搜索关键词，多个用逗号分隔" },
              type: { type: "string", description: "POI类型：景点、餐饮、住宿、购物" }
            },
            required: ["city", "keywords"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "route_planning",
          description: "规划两个位置之间的路线",
          parameters: {
            type: "object",
            properties: {
              origin: { type: "string", description: "起点经纬度，格式：lng,lat" },
              destination: { type: "string", description: "终点经纬度，格式：lng,lat" },
              mode: { type: "string", description: "出行方式：walking/driving/riding/transfer" }
            },
            required: ["origin", "destination", "mode"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_user_preferences",
          description: "获取用户的历史偏好，用于个性化推荐",
          parameters: {
            type: "object",
            properties: {
              user_id: { type: "string", description: "用户ID" }
            },
            required: ["user_id"]
          }
        }
      }
    ];
  }

  /**
   * 发送聊天请求
   * @param {string} systemPrompt - 系统提示词
   * @param {string} userMessage - 用户消息
   * @param {Array} messages - 历史消息（可选）
   * @returns {Promise<Object>} 聊天响应
   */
  async chat(systemPrompt, userMessage, messages = []) {
    const requestMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
      { role: 'user', content: userMessage }
    ];

    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: requestMessages,
      tools: this.tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response;
  }

  /**
   * 处理工具调用
   * @param {Object} choice - Chat completion choice
   * @param {Function} toolHandler - 工具处理函数
   * @returns {Promise<Object>} 处理结果
   */
  async handleToolCalls(choice, toolHandler) {
    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
      return null;
    }

    const results = [];

    for (const toolCall of choice.message.tool_calls) {
      const functionName = toolCall.function.name;
      const arguments_str = toolCall.function.arguments;
      let arguments_obj = {};

      try {
        arguments_obj = JSON.parse(arguments_str);
      } catch (e) {
        console.error('解析工具参数失败:', e);
        continue;
      }

      try {
        const result = await toolHandler(functionName, arguments_obj);
        results.push({
          tool_call_id: toolCall.id,
          function_name: functionName,
          result: result
        });
      } catch (e) {
        console.error(`工具 ${functionName} 执行失败:`, e);
        results.push({
          tool_call_id: toolCall.id,
          function_name: functionName,
          error: e.message
        });
      }
    }

    return results;
  }

  /**
   * 构建带工具调用的后续消息
   * @param {Array} messages - 当前消息历史
   * @param {Array} toolResults - 工具执行结果
   * @returns {Array} 更新后的消息数组
   */
  buildToolMessage(messages, toolResults) {
    const toolMessage = {
      role: 'tool',
      content: JSON.stringify(toolResults)
    };

    return [...messages, toolMessage];
  }
}

// 导出单例
const deepseekClient = new DeepseekClient();

module.exports = deepseekClient;