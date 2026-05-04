# 高德地图路径规划2.0 API Skill

## 概述

高德地图路径规划2.0 API是一套Web服务接口，提供多种路线规划服务，包括驾车、步行、骑行、电动车和公交路线规划。该API以HTTP/HTTPS形式提供服务，支持JSON格式的数据交互。

## 核心功能



### 1. 驾车路线规划

- **API地址**: https://restapi.amap.com/v5/direction/driving
- **请求方式**: GET（参数过长时使用POST）
- **主要参数**:
  - key: 高德开发者Key（必填）
  - origin: 起点经纬度（经度,纬度格式，必填）
  - destination: 目的地经纬度（经度,纬度格式，必填）
  - strategy: 驾车策略（0-速度优先，32-高德推荐，33-躲避拥堵等）
  - waypoints: 途经点（最多16个）
  - plate: 车牌号码（用于限行判断）
  - cartype: 车辆类型（0-燃油车，1-电动车，2-混动车）

### 2. 步行路线规划

- **API地址**: https://restapi.amap.com/v5/direction/walking
- **请求方式**: GET
- **主要参数**:
  - key: 高德开发者Key（必填）
  - origin: 起点经纬度（必填）
  - destination: 目的地经纬度（必填）
  - alternative\_route: 返回路线条数（1-3条）
  - isindoor: 是否需要室内算路（0-否，1-是）

### 3. 骑行路线规划

- **API地址**: https://restapi.amap.com/v5/direction/bicycling
- **请求方式**: GET
- **主要参数**:
  - key: 高德开发者Key（必填）
  - origin: 起点经纬度（必填）
  - destination: 目的地经纬度（必填）
  - alternative\_route: 返回方案条数（1-3条）

### 4. 电动车路线规划

- **API地址**: https://restapi.amap.com/v5/direction/electrobike
- **请求方式**: GET
- **主要参数**: 同骑行路线规划

### 5. 公交路线规划

- **API地址**: https://restapi.amap.com/v5/direction/transit/integrated
- **请求方式**: GET
- **主要参数**:
  - key: 高德开发者Key（必填）
  - origin: 起点经纬度（必填）
  - destination: 目的地经纬度（必填）
  - city1: 起点所在城市code（必填）
  - city2: 目的地所在城市code（必填）
  - strategy: 公交换乘策略（0-推荐模式，1-最经济等）
  - nightflag: 是否考虑夜班车（0-否，1-是）

## 通用参数

### 基础参数

- key: 开发者密钥（必填）
- origin: 起点坐标（经度,纬度格式）
- destination: 目的地坐标（经度,纬度格式）
- output: 返回格式（默认json）
- sig: 数字签名（可选）

### 高级参数

- show\_fields: 控制返回字段（通过逗号分隔多个字段）
- alternative\_route: 控制返回方案数量

## 返回结果结构

### 基础返回字段

```
{
  "status": "1", // 状态码：1成功，0失败
  "info": "ok", // 状态说明
  "infocode": "10000", // 信息码
  "count": "1", // 结果数量
  "route": {} // 路线数据
}
```

### 路线数据结构

- origin: 起点坐标
- destination: 目的地坐标
- paths: 路线方案列表
  - distance: 方案距离（米）
  - steps: 路线分段
    - instruction: 行驶指示
    - road\_name: 道路名称
    - step\_distance: 分段距离
    - orientation: 进入方向

## 使用示例

### 驾车路线请求示例

```
https://restapi.amap.com/v5/direction/driving?origin=116.434307,39.90909&destination=116.434446,39.90816&key=<用户的key>
```

### 步行路线请求示例

```
https://restapi.amap.com/v5/direction/walking?origin=116.466485,39.995197&destination=116.46424,40.020642&key=<用户的key>
```

## 开发准备

### 1. 申请Key

- 注册高德开放平台开发者账号
- 创建应用并获取Web服务API Key

### 2. 流量限制

- 具体流量限制请参考高德开放平台文档
- 建议合理控制请求频率

**## 注意事项**

1. **坐标格式**: 经度在前，纬度在后，用逗号分隔
1. **精度要求**: 经纬度小数点后不超过6位
1. **参数编码**: 所有参数使用UTF-8编码
1. **错误处理**: 根据status和infocode字段判断请求状态

## 扩展功能

通过show\_fields参数可以控制返回的详细信息，包括：

- cost: 费用和时间成本
- navi: 导航动作指令
- polyline: 路线坐标点串
- tmcs: 路况详情

## 适用场景

- 导航应用开发
- 物流路径规划
- 出行服务集成
- 位置服务应用

此Skill文档为AI提供了完整的高德地图路径规划2.0 API使用指南，包括各类型路线规划的接口地址、参数说明、返回结果结构和使用示例。