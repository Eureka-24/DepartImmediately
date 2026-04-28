/**
 * LangChain LLM 配置模块
 * 配置 Deepseek ChatOpenAI 兼容接口
 */

const { ChatOpenAI } = require('@langchain/openai');
const config = require('./index');

/**
 * 创建 Deepseek LLM 实例
 * 使用 ChatOpenAI 类，配置 Deepseek API 的 baseURL
 */
function createDeepseekLLM(options = {}) {
  const {
    temperature = 0.7,
    maxTokens = 2000,
    timeout = 30000, // 30秒超时
    modelName = 'deepseek-chat',
  } = options;

  const llm = new ChatOpenAI({
    model: modelName,
    temperature,
    maxTokens,
    timeout,
    configuration: {
      baseURL: config.deepseek.baseURL,
      apiKey: config.deepseek.apiKey,
    },
  });

  return llm;
}

/**
 * Intent Agent 专用的 LLM（无工具调用，纯 LLM）
 */
function createIntentLLM() {
  return createDeepseekLLM({
    temperature: 0.3, // 意图识别需要更确定性
    maxTokens: 500,
  });
}

/**
 * Planning Agent 专用的 LLM（需要工具调用）
 */
function createPlanningLLM() {
  return createDeepseekLLM({
    temperature: 0.7,
    maxTokens: 3000,
  });
}

/**
 * Structured Agent 专用的 LLM（JSON 解析）
 */
function createStructuredLLM() {
  return createDeepseekLLM({
    temperature: 0.1, // 结构性输出需要低温度
    maxTokens: 2000,
  });
}

module.exports = {
  createDeepseekLLM,
  createIntentLLM,
  createPlanningLLM,
  createStructuredLLM,
};