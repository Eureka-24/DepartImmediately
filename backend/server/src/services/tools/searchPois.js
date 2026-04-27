/**
 * search_pois 工具
 * 调用高德 POI 搜索 API，搜索城市中的 POI 地点
 */

const axios = require('axios');
const config = require('../../config');

// 高德 POI 搜索 API 端点
const AMAP_POI_API = 'https://restapi.amap.com/v3/place/text';

/**
 * POI 类型映射
 * 将用户友好的类型映射到高德 API 的类型编码
 */
const POI_TYPE_MAP = {
  '景点': '风景名胜',
  '餐饮': '餐饮服务',
  '住宿': '住宿服务',
  '购物': '购物服务',
  '酒店': '住宿服务',
  '餐厅': '餐饮服务',
  '美食': '餐饮服务',
  '公园': '风景名胜',
  '博物馆': '风景名胜',
  '古迹': '风景名胜',
};

/**
 * 搜索城市中的 POI 地点
 * @param {string} city - 城市名称
 * @param {string} keywords - 搜索关键词，多个用逗号分隔
 * @param {string} type - POI 类型（可选）
 * @returns {Promise<Array>} 格式化后的 POI 列表
 */
async function searchPois(city, keywords, type = '') {
  // 构建搜索关键词
  let searchKeywords = keywords;
  if (type && POI_TYPE_MAP[type]) {
    searchKeywords = `${keywords},${POI_TYPE_MAP[type]}`;
  }

  try {
    const response = await axios.get(AMAP_POI_API, {
      params: {
        key: config.amap.webServiceKey,
        keywords: searchKeywords,
        city: city,
        citylimit: true, // 限制在指定城市内
        output: 'json',
        offset: 10,
        page: 1,
      },
      timeout: 10000, // 10秒超时
    });

    if (response.data.status !== '1' || !response.data.pois) {
      console.error('高德 POI API 返回错误:', response.data.info);
      return [];
    }

    // 格式化返回结果
    const pois = response.data.pois.map((poi, index) => ({
      id: poi.id || `poi_${index}`,
      name: poi.name,
      location: poi.location,
      address: poi.address || '',
      type: poi.type || type,
      typecode: poi.typecode || '',
      rating: parseFloat(poi.biz_ext?.rating) || 0, // 评分
      cost: poi.biz_ext?.cost || '', // 人均消费
      businessHours: poi.biz_ext?.business_hours || '', // 营业时间
    }));

    return pois;
  } catch (error) {
    console.error('POI 搜索失败:', error.message);
    throw new Error(`POI 搜索失败: ${error.message}`);
  }
}

/**
 * 根据已有 POI 列表过滤和排序
 * @param {Array} pois - POI 列表
 * @param {Object} options - 过滤选项
 * @returns {Array} 过滤后的 POI 列表
 */
function filterAndRankPois(pois, options = {}) {
  const { maxResults = 8, preferTypes = [], avoidTypes = [] } = options;

  let filtered = [...pois];

  // 排除某些类型
  if (avoidTypes.length > 0) {
    filtered = filtered.filter(poi => {
      const poiType = (poi.type || '').toLowerCase();
      return !avoidTypes.some(t => poiType.includes(t.toLowerCase()));
    });
  }

  // 优先某些类型
  if (preferTypes.length > 0) {
    filtered.sort((a, b) => {
      const aMatch = preferTypes.some(t => (a.type || '').includes(t));
      const bMatch = preferTypes.some(t => (b.type || '').includes(t));
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      // 评分高的优先
      return (b.rating || 0) - (a.rating || 0);
    });
  } else {
    // 默认按评分排序
    filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }

  // 限制返回数量
  return filtered.slice(0, maxResults);
}

module.exports = {
  searchPois,
  filterAndRankPois,
  POI_TYPE_MAP,
};