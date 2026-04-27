/**
 * route_planning 工具
 * 调用高德路径规划 API，规划两个位置之间的路线
 */

const axios = require('axios');
const config = require('../../config');

// 高德路径规划 API 端点
const AMAP_DIRECTION_API = 'https://restapi.amap.com/v3/direction/';

/**
 * 出行方式映射
 * 将用户友好的出行方式映射到高德 API 的类型
 */
const MODE_MAP = {
  'walking': 'walking',
  'driving': 'driving',
  'riding': 'riding',
  'transfer': 'transit',
};

/**
 * 出行方式中文映射
 */
const MODE_CHINESE = {
  'walking': '步行',
  'driving': '驾车',
  'riding': '骑行',
  'transit': '公交',
};

/**
 * 规划两个位置之间的路线
 * @param {string} origin - 起点经纬度，格式：lng,lat
 * @param {string} destination - 终点经纬度，格式：lng,lat
 * @param {string} mode - 出行方式：walking/driving/riding/transfer
 * @returns {Promise<Object>} 路线规划结果
 */
async function routePlanning(origin, destination, mode = 'walking') {
  // 验证坐标格式
  if (!origin || !destination) {
    throw new Error('起点和终点坐标不能为空');
  }

  const originCoords = origin.split(',').map(c => c.trim());
  const destCoords = destination.split(',').map(c => c.trim());

  if (originCoords.length !== 2 || destCoords.length !== 2) {
    throw new Error('坐标格式错误，应为：lng,lat');
  }

  const apiMode = MODE_MAP[mode] || 'walking';
  const apiUrl = `${AMAP_DIRECTION_API}${apiMode}`;

  try {
    const response = await axios.get(apiUrl, {
      params: {
        key: config.amap.webServiceKey,
        origin: origin.replace(/,/g, ''), // 移除逗号，高德API格式为 lnglat
        destination: destination.replace(/,/g, ''),
        output: 'json',
      },
      timeout: 10000, // 10秒超时
    });

    if (response.data.status !== '1') {
      console.error('高德路径规划 API 返回错误:', response.data.info);
      throw new Error(`路径规划失败: ${response.data.info || '未知错误'}`);
    }

    // 解析路径规划结果
    const result = parseRouteResult(response.data, mode);

    return result;
  } catch (error) {
    if (error.response) {
      // HTTP 错误
      console.error('高德 API HTTP 错误:', error.response.status);
      throw new Error(`路径规划服务暂时不可用`);
    }
    console.error('路径规划失败:', error.message);
    throw new Error(`路径规划失败: ${error.message}`);
  }
}

/**
 * 解析高德路径规划结果
 * @param {Object} data - 高德 API 响应数据
 * @param {string} mode - 出行方式
 * @returns {Object} 格式化后的路径结果
 */
function parseRouteResult(data, mode) {
  const apiMode = MODE_MAP[mode] || 'walking';

  if (apiMode === 'walking' || apiMode === 'riding') {
    // 步行或骑行
    const route = data.paths?.[0];
    if (!route) {
      return {
        distance: 0,
        duration: 0,
        path: [],
        strategy: data.tag || '',
      };
    }

    return {
      distance: parseInt(route.distance) || 0, // 米
      duration: parseInt(route.duration) || 0, // 秒
      path: parsePathToCoordinates(route.steps || []),
      strategy: data.tag || '',
      transport: MODE_CHINESE[mode] || mode,
    };
  } else if (apiMode === 'driving') {
    // 驾车
    const route = (data.routes && data.routes.route) || data.paths?.[0];
    if (!route) {
      return {
        distance: 0,
        duration: 0,
        path: [],
        strategy: '',
      };
    }

    return {
      distance: parseInt(route.distance) || 0,
      duration: parseInt(route.time) || 0, // 高德驾车是 time 字段
      path: parseDrivingPath(route.steps || []),
      strategy: data.tag || '',
      transport: MODE_CHINESE[mode] || mode,
    };
  } else if (apiMode === 'transit') {
    // 公交（公共交通）
    const route = data.routes?.[0];
    if (!route) {
      return {
        distance: 0,
        duration: 0,
        path: [],
        segments: [],
      };
    }

    return {
      distance: parseInt(route.distance) || 0,
      duration: parseInt(route.time) || 0,
      path: [],
      segments: parseTransitSegments(route.segments || []),
      transport: MODE_CHINESE[mode] || mode,
    };
  }

  return {
    distance: 0,
    duration: 0,
    path: [],
    transport: MODE_CHINESE[mode] || mode,
  };
}

/**
 * 解析步行/骑行路径步骤为坐标点
 * @param {Array} steps - 路径步骤
 * @returns {Array} 坐标点数组
 */
function parsePathToCoordinates(steps) {
  const coordinates = [];

  for (const step of steps) {
    if (step.polyline) {
      // polyline 是坐标点用;分隔的字符串
      const points = step.polyline.split(';');
      for (const point of points) {
        const [lng, lat] = point.split(',');
        if (lng && lat) {
          coordinates.push({
            lng: parseFloat(lng),
            lat: parseFloat(lat),
          });
        }
      }
    }
  }

  return coordinates;
}

/**
 * 解析驾车路径步骤
 * @param {Array} steps - 驾车步骤
 * @returns {Array} 坐标点数组
 */
function parseDrivingPath(steps) {
  const coordinates = [];

  for (const step of steps) {
    if (step.polyline) {
      const points = step.polyline.split(';');
      for (const point of points) {
        const [lng, lat] = point.split(',');
        if (lng && lat) {
          coordinates.push({
            lng: parseFloat(lng),
            lat: parseFloat(lat),
          });
        }
      }
    }
  }

  return coordinates;
}

/**
 * 解析公交路径段
 * @param {Array} segments - 公交路径段
 * @returns {Array} 段信息数组
 */
function parseTransitSegments(segments) {
  return segments.map(seg => ({
    type: seg.type || '',
    line: seg.line?.name || '',
    startStation: seg.start_name || '',
    endStation: seg.end_name || '',
    duration: parseInt(seg.time) || 0,
  }));
}

/**
 * 估算交通时间（用于快速估算）
 * @param {number} distance - 距离（米）
 * @param {string} mode - 出行方式
 * @returns {number} 估算时间（秒）
 */
function estimateDuration(distance, mode = 'walking') {
  // 步行速度约 5km/h = 1.39m/s
  // 骑行速度约 15km/h = 4.17m/s
  // 驾车速度约 30km/h = 8.33m/s（考虑交通）

  const speeds = {
    walking: 1.39,
    riding: 4.17,
    driving: 8.33,
    transfer: 6.94, // 公交考虑换乘
  };

  const speed = speeds[mode] || speeds.walking;
  return Math.round(distance / speed);
}

module.exports = {
  routePlanning,
  parseRouteResult,
  parsePathToCoordinates,
  MODE_MAP,
  MODE_CHINESE,
  estimateDuration,
};