/**
 * LangChain Tools 包装
 * 将现有工具包装为 LangChain Tool 格式
 */

const { tool } = require('@langchain/core/tools');
const { searchPois, filterAndRankPois } = require('./searchPois');
const { routePlanning } = require('./routePlanning');
const { getUserPreferences } = require('./userPrefs');

/**
 * search_pois 工具
 * 搜索城市中的 POI 地点
 */
const searchPoisTool = tool(
  async ({ city, keywords, type }) => {
    try {
      const pois = await searchPois(city, keywords, type);
      const filteredPois = filterAndRankPois(pois, { maxResults: 8 });

      return {
        success: true,
        pois: filteredPois.slice(0, 5),
        total: filteredPois.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
  {
    name: 'search_pois',
    description: '搜索城市中的POI地点，如景点、餐厅、酒店等。根据城市名称和关键词搜索相关地点。',
    schema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，如"北京"、"上海"',
        },
        keywords: {
          type: 'string',
          description: '搜索关键词，多个用逗号分隔，如"景点,美食,公园"',
        },
        type: {
          type: 'string',
          description: 'POI类型：景点、餐饮、住宿、购物（可选）',
        },
      },
      required: ['city', 'keywords'],
    },
  }
);

/**
 * route_planning 工具
 * 规划两个位置之间的路线
 */
const routePlanningTool = tool(
  async ({ origin, destination, mode, city }) => {
    try {
      const options = city ? { city } : {};
      const route = await routePlanning(origin, destination, mode, options);
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
  },
  {
    name: 'route_planning',
    description: '规划两个位置之间的路线。输入起点和终点的经纬度坐标，返回距离、时间和路线信息。公交规划需要提供城市参数。',
    schema: {
      type: 'object',
      properties: {
        origin: {
          type: 'string',
          description: '起点经纬度，格式：lng,lat，例如"116.397428,39.90923"',
        },
        destination: {
          type: 'string',
          description: '终点经纬度，格式：lng,lat，例如"116.410682,39.899789"',
        },
        mode: {
          type: 'string',
          enum: ['walking', 'driving', 'riding', 'transfer'],
          description: '出行方式：walking(步行)、driving(驾车)、riding(骑行)、transfer(公交)',
        },
        city: {
          type: 'string',
          description: '城市名称，用于公交规划，如"北京"。其他出行方式可不填。',
        },
      },
      required: ['origin', 'destination', 'mode'],
    },
  }
);

/**
 * get_user_preferences 工具
 * 获取用户的历史偏好
 */
const getUserPreferencesTool = tool(
  async ({ user_id }) => {
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
  },
  {
    name: 'get_user_preferences',
    description: '获取用户的历史偏好信息，包括喜欢的城市、旅行风格等，用于个性化推荐。',
    schema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: '用户ID',
        },
      },
      required: ['user_id'],
    },
  }
);

/**
 * 导出所有工具
 */
const tools = [searchPoisTool, routePlanningTool, getUserPreferencesTool];

/**
 * 工具名称到对象的映射
 */
const toolsByName = {
  search_pois: searchPoisTool,
  route_planning: routePlanningTool,
  get_user_preferences: getUserPreferencesTool,
};

module.exports = {
  searchPoisTool,
  routePlanningTool,
  getUserPreferencesTool,
  tools,
  toolsByName,
};