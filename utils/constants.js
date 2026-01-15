// 常量定义
const YOUPIN_CONSTANTS = {
  // API相关
  API_URL: 'https://api.youpin898.com/api/homepage/pc/goods/market/queryOnLeaseCommodityList',

  // DOM选择器
  SELECTORS: {
    TABLE_BODY: '.ant-table-tbody',
    TABLE_ROW: '.ant-table-row',
    USER_INFO_BOX: '.user-info-box___hkAd1',
    USER_AVATAR: '.ant-image',
  },

  // 自定义事件名
  EVENTS: {
    USER_DATA_RECEIVED: 'youpinUserData',
  },

  // 数据属性名
  DATA_ATTRS: {
    PROCESSED: 'youpinProcessed',
    USER_ID: 'youpinUserId',
  },

  // CSS类名
  CSS_CLASSES: {
    USER_ID_CONTAINER: 'youpin-ext-userid',
    REMARK_SPAN: 'youpin-ext-remark',
    MODAL: 'youpin-ext-modal',
    MODAL_CONTENT: 'youpin-ext-modal-content',
  },

  // 默认配置
  DEFAULTS: {
    COLOR: '#1890ff',
    DEBOUNCE_DELAY: 200,
    REMARK_MAX_LENGTH: 50,
  },

  // 存储键名
  STORAGE_KEYS: {
    USER_REMARKS: 'userRemarks',
  },

  // 日志前缀
  LOG_PREFIX: '[YouPin Ext]',
};

// 确保在全局作用域可访问（Content Script环境）
if (typeof window !== 'undefined') {
  window.YOUPIN_CONSTANTS = YOUPIN_CONSTANTS;
}
