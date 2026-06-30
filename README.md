# 积分银行 · Kids Points Bank

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker Image](https://img.shields.io/badge/ghcr.io-robs87/kids--points--bank-blue?logo=docker)](https://github.com/Robs87/kids-points-bank/pkgs/container/kids-points-bank)
[![Unraid](https://img.shields.io/badge/Unraid-✅-4153A0?logo=linux)](#-%E9%83%A8%E7%BD%B2)
[![GitHub Stars](https://img.shields.io/github/stars/Robs87/kids-points-bank?style=social)](https://github.com/Robs87/kids-points-bank/stargazers)

[English](README_EN.md) | 中文

> 把无形的"自律"变成有形的"资产"，用代币机制催化孩子的自发驱动力。

## 📖 简介

积分银行是一个纯前端的儿童成长激励工具，基于教育心理学中的**代币经济（Token Economy）**理论，将抽象的"自律"转化为有形的积分系统。

参考自 [杰西卡《暑假成长积分银行》](https://mp.weixin.qq.com/s/rgny628l633XrJeZokrcZg)，在原有思路上进行了完整的产品化和工程化实现。

## 🧠 设计原理

| 问题 | 解法 | 心理学依据 |
|------|------|-----------|
| 孩子面对抽象、长期的成长目标缺乏动力 | 把每个行动变成即时可见的积分 | 即时正反馈循环，多巴胺驱动 |
| 大目标让人迷茫 | 拆解为每天看得见的小任务 | 目标梯度效应 |
| 打卡容易三分钟热度 | 连续打卡奖励 + 每周家庭复盘 | 反思性学习，防止倦怠 |
| 物质奖励削弱内在动机 | 经验型奖励为主（电影、旅行、选菜单） | 内在动机保护 |

## ✨ 五大模块

### 1. 🗺️ 成长地图

五大维度可视化，点击展开任务详情，完成度环形图实时展示。

### 2. ✅ 今日打卡

- 按维度分类的任务列表
- 勾选即赚积分，实时飘字动画 + 震动反馈
- 连续打卡里程碑奖励（3/7/14/30 天）
- 每日打卡上限防沉迷

### 3. 🎁 奖励兑换

三级阶梯奖励体系：

| 等级 | 价格 | 示例 |
|------|------|------|
| ⭐ 小奖励 | 10 分 | 选一次家庭电影、点播睡前故事 |
| 🌟 中奖励 | 30 分 | 买一本喜欢的书、一次亲子外出 |
| 💫 大奖励 | 60 分 | 一次短途旅行、实现一个小愿望 |

家长可自定义奖励内容，兑换需家长确认。

### 4. 📊 每周复盘

周末家庭会议模板：
- 孩子写"最棒的事"和"遇到的困难"
- 家长写"看见的进步"
- 孩子提"希望的支持"
- 自动统计本周任务完成数、积分、点亮维度

### 5. 📸 成长作品

- 拍照/上传照片记录成长瞬间
- 关联成长维度标签
- 图片自动压缩存储（IndexedDB）
- 期末自动生成成长档案

## 📐 系统架构

```
┌─────────────────────────────────────────────┐
│                   Browser                   │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ 成长地图  │  │ 今日打卡  │  │ 奖励兑换  │  │
│  │ Map View │  │ Checkin  │  │ Rewards  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │             │          │
│  ┌────┴──────────────┴─────────────┴─────┐   │
│  │          App Core (app.js)             │   │
│  │  Tab Router │ State │ Animations       │   │
│  └──────────────────┬─────────────────────┘   │
│                     │                          │
│  ┌──────────────────┴─────────────────────┐   │
│  │         Storage Layer                  │   │
│  │  ┌──────────────┐  ┌───────────────┐   │   │
│  │  │ localStorage │  │  IndexedDB    │   │   │
│  │  │ (JSON)       │  │ (Images)      │   │   │
│  │  └──────────────┘  └───────────────┘   │   │
│  └────────────────────────────────────────┘   │
│                                              │
│  ┌────────────────────────────────────────┐   │
│  │         Data Model (data.js)           │   │
│  │  5 Dimensions × 18 Tasks               │   │
│  │  3 Reward Tiers                        │   │
│  └────────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## 📁 项目结构

```
kids-points-bank/
├── index.html          # 主页面，5 个模块 + 底部导航
├── css/
│   └── style.css       # 样式表（移动端优先，清新绿配色）
├── js/
│   ├── data.js         # 数据模型（维度/任务/奖励/设置）
│   ├── storage.js      # 存储层（localStorage + IndexedDB）
│   └── app.js          # 核心逻辑（5 模块 + 路由 + 动画）
├── Dockerfile          # Docker 镜像构建文件
├── kids-points-bank.xml # Unraid 模板
├── .github/            # GitHub 模板（Issue/PR）
├── CONTRIBUTING.md     # 贡献指南
├── SECURITY.md         # 安全策略
├── CHANGELOG.md        # 更新日志
└── README.md           # 本文件
```

## 🚀 快速开始

### 方式一：本地直接使用（最简单）

1. 下载或克隆本项目
2. 在浏览器中打开 `index.html`
3. 即可使用，无需服务器

### 方式二：Docker 部署

```bash
docker run -d \
  --name kids-points-bank \
  --restart unless-stopped \
  -p 8899:80 \
  ghcr.io/robs87/kids-points-bank:latest
```

访问 `http://localhost:8899/`

### 方式三：Unraid 部署

在 Unraid Docker 页面中，使用模板 `kids-points-bank.xml` 添加容器，或直接通过 WebUI 搜索 `ghcr.io/robs87/kids-points-bank`。

## 🛡️ 安全与隐私

- **纯前端应用**：所有数据存储在本地浏览器（localStorage + IndexedDB）
- **零网络请求**：无需服务器，无需注册，离线可用
- **家长门禁**：奖励兑换、积分修正需家长确认
- **数据导出**：一键导出 JSON 备份，随时恢复
- **XSS 防护**：所有用户输入经过 HTML 转义

## ⚙️ 自定义

所有配置在 `js/data.js` 中：

- **修改任务**：编辑 `dimensions[].tasks` 数组
- **修改奖励**：编辑 `rewards[].items` 数组
- **修改积分**：调整 `tasks[].points` 值
- **设置 PIN 码**：在 `settings.parentPin` 中设置 4-6 位数字

## 🐛 已知限制

- 数据存储在浏览器本地，换设备需手动导出/导入
- 图片压缩质量固定为 70% JPEG
- 不支持多孩子/多账户
- 家长设置面板尚未实现（需手动编辑代码）

## 📄 许可

本项目采用 [MIT 许可证](LICENSE)。

---

> "积分不是为了控制孩子，而是为了让孩子看见：我的努力是有价值的。"

---

## English

Kids Points Bank is a pure frontend children's growth incentive tool based on **Token Economy** theory in educational psychology. It transforms abstract self-discipline into tangible point-based rewards.

**Features:** 5 growth dimensions, daily check-in, reward redemption, weekly review, portfolio gallery. Zero dependencies, works offline, data stored locally.

**Deploy:** Open `index.html` in browser, or run via Docker: `docker run -d -p 8899:80 ghcr.io/robs87/kids-points-bank:latest`

**License:** MIT
