// 存储管理模块
const StorageManager = {
  /**
   * 获取所有备注数据
   * @returns {Promise<Object>} 备注数据对象
   */
  async getAllRemarks() {
    try {
      const result = await chrome.storage.local.get(YOUPIN_CONSTANTS.STORAGE_KEYS.USER_REMARKS);
      return result[YOUPIN_CONSTANTS.STORAGE_KEYS.USER_REMARKS] || {};
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} 获取备注数据失败:`, error);
      return {};
    }
  },

  /**
   * 获取单个用户的备注
   * @param {number|string} userId - 用户ID
   * @returns {Promise<Object|null>} 备注数据对象或null
   */
  async getRemark(userId) {
    try {
      const remarks = await this.getAllRemarks();
      return remarks[userId] || null;
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} 获取用户备注失败:`, error);
      return null;
    }
  },

  /**
   * 保存用户备注
   * @param {number|string} userId - 用户ID
   * @param {string} remarkText - 备注文本
   * @param {string} color - 颜色值
   * @param {string} nickname - 用户昵称（可选）
   * @returns {Promise<boolean>} 是否保存成功
   */
  async saveRemark(userId, remarkText, color, nickname = '') {
    try {
      const remarks = await this.getAllRemarks();
      const now = Date.now();

      remarks[userId] = {
        userId: parseInt(userId),
        remark: remarkText.trim(),
        color: color || YOUPIN_CONSTANTS.DEFAULTS.COLOR,
        nickname: nickname,
        updatedAt: now,
        ...(remarks[userId]?.createdAt ? {} : { createdAt: now })
      };

      await chrome.storage.local.set({
        [YOUPIN_CONSTANTS.STORAGE_KEYS.USER_REMARKS]: remarks
      });

      console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 保存备注成功:`, userId, remarkText);
      return true;
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} 保存备注失败:`, error);
      return false;
    }
  },

  /**
   * 删除用户备注
   * @param {number|string} userId - 用户ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteRemark(userId) {
    try {
      const remarks = await this.getAllRemarks();
      delete remarks[userId];

      await chrome.storage.local.set({
        [YOUPIN_CONSTANTS.STORAGE_KEYS.USER_REMARKS]: remarks
      });

      console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 删除备注成功:`, userId);
      return true;
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} 删除备注失败:`, error);
      return false;
    }
  },

  /**
   * 批量获取备注
   * @param {Array<number|string>} userIds - 用户ID数组
   * @returns {Promise<Object>} 备注数据对象
   */
  async getRemarksBatch(userIds) {
    try {
      const allRemarks = await this.getAllRemarks();
      const result = {};

      userIds.forEach(userId => {
        if (allRemarks[userId]) {
          result[userId] = allRemarks[userId];
        }
      });

      return result;
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} 批量获取备注失败:`, error);
      return {};
    }
  },

  /**
   * 导出所有备注数据
   * @returns {Promise<string>} JSON字符串
   */
  async exportRemarks() {
    try {
      const remarks = await this.getAllRemarks();
      return JSON.stringify(remarks, null, 2);
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} 导出备注失败:`, error);
      return '{}';
    }
  },

  /**
   * 导入备注数据
   * @param {string} jsonData - JSON字符串
   * @returns {Promise<boolean>} 是否导入成功
   */
  async importRemarks(jsonData) {
    try {
      const data = JSON.parse(jsonData);

      await chrome.storage.local.set({
        [YOUPIN_CONSTANTS.STORAGE_KEYS.USER_REMARKS]: data
      });

      console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 导入备注成功`);
      return true;
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} 导入备注失败:`, error);
      return false;
    }
  },

  /**
   * 清空所有备注数据
   * @returns {Promise<boolean>} 是否清空成功
   */
  async clearAllRemarks() {
    try {
      await chrome.storage.local.set({
        [YOUPIN_CONSTANTS.STORAGE_KEYS.USER_REMARKS]: {}
      });

      console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 清空所有备注成功`);
      return true;
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} 清空备注失败:`, error);
      return false;
    }
  }
};

// 导出到全局
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}
