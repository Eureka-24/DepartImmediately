/**
 * get_user_preferences 工具
 * 从数据库查询用户的历史偏好
 */

const db = require('../../db');

/**
 * 获取用户偏好
 * @param {string} userId - 用户ID
 * @returns {Promise<Object>} 用户偏好对象
 */
async function getUserPreferences(userId) {
  if (!userId) {
    throw new Error('用户ID不能为空');
  }

  try {
    const preferences = db.query(
      'SELECT * FROM user_preferences WHERE user_id = ?',
      [userId]
    );

    if (preferences.length === 0) {
      // 返回空偏好而非错误
      return {
        favoriteCities: [],
        favoriteTypes: [],
        travelStyle: '',
      };
    }

    const pref = preferences[0];

    return {
      favoriteCities: pref.favorite_cities ? JSON.parse(pref.favorite_cities) : [],
      favoriteTypes: pref.favorite_types ? JSON.parse(pref.favorite_types) : [],
      travelStyle: pref.travel_style || '',
    };
  } catch (error) {
    console.error('获取用户偏好失败:', error.message);
    throw new Error(`获取用户偏好失败: ${error.message}`);
  }
}

/**
 * 解析用户偏好，提取搜索关键词
 * @param {Object} preferences - 用户偏好对象
 * @param {string} userInput - 用户输入的偏好描述（可选）
 * @returns {Object} 提取的关键词和偏好信息
 */
function extractPreferenceKeywords(preferences, userInput = '') {
  const result = {
    keywords: [],
    travelStyle: preferences.travelStyle || '',
    avoidTypes: [],
  };

  // 从用户输入中提取关键词
  if (userInput) {
    const input = userInput.toLowerCase();

    // 识别不想去的地方
    if (input.includes('不想') || input.includes('不去') || input.includes('避开')) {
      if (input.includes('排队')) result.avoidTypes.push('排队');
      if (input.includes('人多')) result.avoidTypes.push('人多');
      if (input.includes('热门')) result.avoidTypes.push('热门');
    }

    // 识别旅行风格
    if (input.includes('亲子') || input.includes('带娃')) {
      result.travelStyle = '亲子';
      result.keywords.push('亲子', '儿童', '乐园');
    }
    if (input.includes('美食') || input.includes('吃货')) {
      result.travelStyle = '美食';
      result.keywords.push('美食', '餐厅', '小吃');
    }
    if (input.includes('休闲') || input.includes('放松')) {
      result.travelStyle = '休闲';
      result.keywords.push('公园', '茶馆', '咖啡');
    }
    if (input.includes('文化') || input.includes('历史')) {
      result.travelStyle = '文化';
      result.keywords.push('博物馆', '古迹', '历史');
    }
    if (input.includes('购物')) {
      result.travelStyle = '购物';
      result.keywords.push('商场', '商业街', '购物');
    }
    if (input.includes('拍照') || input.includes('打卡')) {
      result.keywords.push('网红', '打卡', '拍照');
    }
  }

  // 合并用户历史偏好
  if (preferences.favoriteTypes && preferences.favoriteTypes.length > 0) {
    result.keywords = [...new Set([...result.keywords, ...preferences.favoriteTypes])];
  }

  // 如果没有提取到关键词，提供默认值
  if (result.keywords.length === 0) {
    result.keywords = ['景点', '热门'];
  }

  return result;
}

module.exports = {
  getUserPreferences,
  extractPreferenceKeywords,
};