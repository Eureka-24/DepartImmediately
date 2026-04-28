/**
 * route_planning 工具
 * 调用高德路径规划 API，规划两个位置之间的路线
 */

const axios = require('axios');
const config = require('../../config');

// 高德路径规划 API 端点
const AMAP_DIRECTION_API_V3 = 'https://restapi.amap.com/v3/direction/';
const AMAP_DIRECTION_API_V4 = 'https://restapi.amap.com/v4/direction/';

/**
 * 出行方式映射
 * 将用户友好的出行方式映射到高德 API 的类型
 */
const MODE_MAP = {
  'walking': 'walking',
  'driving': 'driving',
  'riding': 'bicycling', // 骑行在 v4 API 中是 bicycling
  'transfer': 'transit/integrated', // 公交规划端点
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
 * @param {Object} options - 额外参数
 * @param {string} options.city - 城市名称（公交规划必需）
 * @returns {Promise<Object>} 路线规划结果
 */
async function routePlanning(origin, destination, mode = 'walking', options = {}) {
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

  // 判断使用 v3 还是 v4 API
  let apiUrl;
  if (mode === 'riding') {
    // 骑行使用 v4 API
    apiUrl = `${AMAP_DIRECTION_API_V4}bicycling`;
  } else if (mode === 'transfer') {
    // 公交使用 v3 API 的 integrated 端点
    apiUrl = `${AMAP_DIRECTION_API_V3}transit/integrated`;
  } else {
    // 步行、驾车使用 v3 API
    apiUrl = `${AMAP_DIRECTION_API_V3}${apiMode}`;
  }

  try {
    const params = {
      key: config.amap.webServiceKey,
      origin: origin,
      destination: destination,
      output: 'json',
    };

    // 公交规划需要 city 参数
    if (mode === 'transfer' && options.city) {
      params.city = options.city;
    }

    const response = await axios.get(apiUrl, {
      params,
      timeout: 10000, // 10秒超时
    });

    // 根据不同的 API 响应格式检查状态
    let statusOk = false;
    let errorInfo = '';

    if (mode === 'riding') {
      // v4 API 骑行
      statusOk = response.data.errcode === 0;
      errorInfo = response.data.errmsg || '';
    } else if (mode === 'transfer') {
      // 公交
      statusOk = response.data.status === '1';
      errorInfo = response.data.info || '';
    } else {
      // 步行、驾车
      statusOk = response.data.status === '1';
      errorInfo = response.data.info || '';
    }

    if (!statusOk) {
      console.error(`高德路径规划 API 返回错误: ${errorInfo}`);
      throw new Error(`路径规划失败: ${errorInfo || '未知错误'}`);
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

  if (mode === 'walking') {
    // 步行
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
  } else if (mode === 'riding') {
    // 骑行 (v4 API)
    // v4 API 返回结构: { errcode: 0, data: { paths: [...] } }
    const route = data.data?.paths?.[0];
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
      duration: parseInt(route.duration) || 0,
      path: parsePathToCoordinates(route.steps || []),
      strategy: '',
      transport: MODE_CHINESE[mode] || mode,
    };
  } else if (mode === 'driving') {
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
  } else if (mode === 'transfer') {
    // 公交 (v3 API integrated)
    const route = data.route;
    if (!route || !route.transits || route.transits.length === 0) {
      return {
        distance: 0,
        duration: 0,
        path: [],
        segments: [],
      };
    }

    const transit = route.transits[0];
    return {
      distance: parseInt(route.distance) || 0,
      duration: parseInt(transit.duration) || 0,
      path: [],
      segments: parseTransitSegments(transit.segments || []),
      transport: MODE_CHINESE[mode] || mode,
      cost: transit.cost || 0, // 费用
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
    distance: parseInt(seg.walking?.distance) || 0,
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