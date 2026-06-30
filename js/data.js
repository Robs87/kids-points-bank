/**
 * 积分银行 - 数据模型
 * 
 * 五大成长维度 + 默认任务 + 三级奖励模板
 * 所有数据均可被家长自定义覆盖
 */

const DEFAULT_DATA = {
  // ========== 五大成长维度 ==========
  dimensions: [
    {
      id: 'learning',
      name: '学习力',
      icon: '📚',
      color: '#4ECDC4',
      description: '阅读、练字、复盘，让学习变成稳定的好习惯',
      tasks: [
        { id: 'learn_read', name: '认真阅读30分钟', points: 2, minAge: 4 },
        { id: 'learn_write', name: '认真练字一页', points: 2, minAge: 5 },
        { id: 'learn_diary', name: '认真写日记', points: 2, minAge: 5 },
        { id: 'learn_review', name: '完成本周复盘', points: 3, minAge: 5, frequency: 'weekly' },
        { id: 'learn_extra', name: '额外学习（数学/英语等）', points: 2, minAge: 5 },
      ]
    },
    {
      id: 'sports',
      name: '运动力',
      icon: '🏃',
      color: '#FF6B6B',
      description: '运动和户外，让身体先充满假期的电量',
      tasks: [
        { id: 'sport_outdoor', name: '户外活动2小时', points: 2, minAge: 3 },
        { id: 'sport_exercise', name: '专项运动训练', points: 2, minAge: 4 },
        { id: 'sport_game', name: '家庭运动游戏', points: 1, minAge: 3 },
      ]
    },
    {
      id: 'self_control',
      name: '自控力',
      icon: '🎯',
      color: '#95E1D3',
      description: '安排时间、管理屏幕，把计划握在自己手里',
      tasks: [
        { id: 'ctrl_screen', name: '控制屏幕时间不超过2小时', points: 2, minAge: 4 },
        { id: 'ctrl_schedule', name: '按时完成今日计划', points: 2, minAge: 5 },
        { id: 'ctrl_emotion', name: '情绪管理成功（没发脾气）', points: 1, minAge: 3 },
      ]
    },
    {
      id: 'explore',
      name: '探索力',
      icon: '🔬',
      color: '#F38183',
      description: '兴趣、情绪和沟通，找到属于自己的好奇心',
      tasks: [
        { id: 'explore_interest', name: '探索一个新兴趣/爱好', points: 2, minAge: 4 },
        { id: 'explore_question', name: '提出一个有深度的问题', points: 1, minAge: 4 },
        { id: 'explore_social', name: '和朋友/家人有效沟通', points: 1, minAge: 3 },
      ]
    },
    {
      id: 'practice',
      name: '实践力',
      icon: '🛠️',
      color: '#AA96DA',
      description: '家务、做饭、志愿服务，把成长做出来',
      tasks: [
        { id: 'prac_housework', name: '完成一项家务劳动', points: 2, minAge: 3 },
        { id: 'prac_cook', name: '帮忙做饭或独立做一道菜', points: 3, minAge: 5 },
        { id: 'prac_volunteer', name: '参与志愿服务/社区活动', points: 3, minAge: 4 },
        { id: 'prac_clean', name: '整理自己的房间/书桌', points: 1, minAge: 3 },
      ]
    }
  ],

  // ========== 三级奖励体系 ==========
  rewards: [
    {
      tier: 'small',
      label: '小奖励',
      cost: 10,
      icon: '⭐',
      items: [
        { id: 'reward_movie', name: '选择一次家庭电影', editable: true },
        { id: 'reward_story', name: '点播一次睡前故事', editable: true },
        { id: 'reward_menu', name: '选择一次晚餐菜单', editable: true },
      ]
    },
    {
      tier: 'medium',
      label: '中奖励',
      cost: 30,
      icon: '🌟',
      items: [
        { id: 'reward_book', name: '买一本喜欢的书', editable: true },
        { id: 'reward_party', name: '一次朋友聚会', editable: true },
        { id: 'reward_outing', name: '一次亲子外出', editable: true },
      ]
    },
    {
      tier: 'large',
      label: '大奖励',
      cost: 60,
      icon: '💫',
      items: [
        { id: 'reward_trip', name: '一次短途旅行', editable: true },
        { id: 'reward_wish', name: '实现一个孩子期待的小愿望', editable: true },
      ]
    }
  ],

  // ========== 连续打卡奖励 ==========
  streakBonus: {
    days: [3, 7, 14, 30],
    bonus: 1
  },

  // ========== 家长设置 ==========
  settings: {
    parentPin: '', // 可选：4位PIN码，用于奖励兑换/任务配置/积分修正
    currencyName: '积分',
    appTitle: '我的积分银行',
    childName: '宝贝',
    startDate: null, // 自动记录首次打开日期
    maxDailyTasks: 10, // 每日最多可打卡任务数
  }
};

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_DATA };
}
