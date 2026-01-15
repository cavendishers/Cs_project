// Content Script - 核心逻辑
(function() {
  'use strict';

  // 等待YOUPIN_CONSTANTS加载
  if (typeof YOUPIN_CONSTANTS === 'undefined') {
    console.error('[YouPin Ext] CRITICAL ERROR: YOUPIN_CONSTANTS 未定义，constants.js 可能未加载');
    return;
  }

  // 检查StorageManager是否加载
  if (typeof StorageManager === 'undefined') {
    console.error('[YouPin Ext] CRITICAL ERROR: StorageManager 未定义，storage.js 可能未加载');
    return;
  }


  // ========== 全局变量 ==========
  const userDataCache = new Map(); // 存储 nickname → userId 映射
  let lastClickPosition = { x: 0, y: 0 }; // 记录右键点击位置
  let observer = null; // MutationObserver实例
  let isInitialized = false; // 防止重复初始化
  let urlWatcher = null; // URL监听器实例

  // ========== 工具函数 ==========

  /**
   * 防抖函数
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * 等待DOM元素出现
   */
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`等待元素超时: ${selector}`));
        } else {
          setTimeout(check, 500);
        }
      };

      check();
    });
  }

  // ========== injector.js 注入 ==========

  function injectFetchInterceptor() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('scripts/injector.js');
      script.onload = function() {
        console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} injector.js script标签加载成功`);
        this.remove();
      };
      script.onerror = function(error) {
        console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} ❌ injector.js 加载失败:`, error);
      };

      const target = document.head || document.documentElement;
      if (!target) {
        console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} ❌ 无法找到注入目标 (head/documentElement)`);
        return;
      }

      target.appendChild(script);
      console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} injector.js script标签已插入DOM`);
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} ❌ 注入injector.js时出错:`, error);
    }
  }

  // ========== 数据接收 ==========

  /**
   * 监听来自injector.js的用户数据
   */
  window.addEventListener(YOUPIN_CONSTANTS.EVENTS.USER_DATA_RECEIVED, (event) => {
    try {
      const userMap = event.detail;

      if (Object.keys(userMap).length === 0) {
        return;
      }

      // 更新缓存
      Object.entries(userMap).forEach(([nickname, userId]) => {
        userDataCache.set(nickname, userId);
      });

      // 立即处理一次
      processExistingUserBoxes();

      // 延迟处理（给DOM时间渲染）
      setTimeout(() => {
        processExistingUserBoxes();
      }, 500);

      // 再延迟一次（确保完全渲染）
      setTimeout(() => {
        processExistingUserBoxes();
      }, 1000);
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} ❌ 处理用户数据失败:`, error);
    }
  });

  // ========== DOM操作 ==========

  /**
   * 注入userId和备注信息到用户信息框
   */
  async function injectUserInfo(userInfoBox, nickname) {
    // 检查是否已处理
    if (userInfoBox.dataset[YOUPIN_CONSTANTS.DATA_ATTRS.PROCESSED]) {
      return;
    }

    // 获取userId
    const userId = userDataCache.get(nickname);
    if (!userId) {
      return;
    }

    // 找到父级 td 元素
    const tdParent = userInfoBox.closest('td');
    if (!tdParent) {
      return;
    }

    // 创建显示容器（块级元素，显示在店铺名下方）
    const container = document.createElement('div');
    container.className = YOUPIN_CONSTANTS.CSS_CLASSES.USER_ID_CONTAINER;

    // 样式设置
    container.style.display = 'block';
    container.style.marginTop = '4px';
    container.style.paddingLeft = '0';

    // ID文本
    const idText = document.createElement('span');
    idText.textContent = `ID: ${userId}`;
    idText.style.color = '#8c8c8c';
    idText.style.fontSize = '12px';
    container.appendChild(idText);

    // 获取备注数据
    const remarkData = await StorageManager.getRemark(userId);
    if (remarkData && remarkData.remark) {
      const remarkSpan = document.createElement('span');
      remarkSpan.className = YOUPIN_CONSTANTS.CSS_CLASSES.REMARK_SPAN;
      remarkSpan.textContent = ` - ${remarkData.remark}`;
      remarkSpan.style.color = remarkData.color || YOUPIN_CONSTANTS.DEFAULTS.COLOR;
      remarkSpan.style.fontWeight = '500';
      container.appendChild(remarkSpan);
    }

    // 插入DOM（添加到td下，与userInfoBox同级）
    tdParent.appendChild(container);

    // 标记已处理（在userInfoBox上标记，方便后续查找）
    userInfoBox.dataset[YOUPIN_CONSTANTS.DATA_ATTRS.PROCESSED] = 'true';
    userInfoBox.dataset[YOUPIN_CONSTANTS.DATA_ATTRS.USER_ID] = userId;

    // 同时在容器上也标记userId，方便刷新时查找
    container.dataset[YOUPIN_CONSTANTS.DATA_ATTRS.USER_ID] = userId;
  }

  /**
   * 处理单个用户信息框
   */
  async function processUserBox(userInfoBox) {
    // 提取昵称 - 在第二个div中（第一个是头像）
    const divs = userInfoBox.querySelectorAll('div');
    if (divs.length < 2) return;

    const nicknameDiv = divs[divs.length - 1]; // 最后一个div是昵称
    const nickname = nicknameDiv.textContent.trim();

    if (nickname) {
      await injectUserInfo(userInfoBox, nickname);
    }
  }

  /**
   * 处理已存在的所有用户信息框
   */
  async function processExistingUserBoxes() {
    const userBoxes = document.querySelectorAll(
      `${YOUPIN_CONSTANTS.SELECTORS.USER_INFO_BOX}:not([data-${YOUPIN_CONSTANTS.DATA_ATTRS.PROCESSED}])`
    );

    for (const box of userBoxes) {
      await processUserBox(box);
    }
  }

  /**
   * 处理Mutation变化
   */
  const handleMutations = debounce((mutations) => {
    const newUserBoxes = [];

    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // 检查节点本身
          if (node.classList && node.classList.contains('user-info-box___hkAd1')) {
            if (!node.dataset[YOUPIN_CONSTANTS.DATA_ATTRS.PROCESSED]) {
              newUserBoxes.push(node);
            }
          }

          // 检查子节点
          const boxes = node.querySelectorAll
            ? node.querySelectorAll(`${YOUPIN_CONSTANTS.SELECTORS.USER_INFO_BOX}:not([data-${YOUPIN_CONSTANTS.DATA_ATTRS.PROCESSED}])`)
            : [];
          newUserBoxes.push(...boxes);
        }
      });
    });

    if (newUserBoxes.length > 0) {
      newUserBoxes.forEach(box => processUserBox(box));
    } else {
      // 即使没检测到，也延迟检查一次（可能DOM还在渲染）
      setTimeout(() => {
        processExistingUserBoxes();
      }, 300);
    }
  }, YOUPIN_CONSTANTS.DEFAULTS.DEBOUNCE_DELAY);

  /**
   * 启动MutationObserver
   */
  async function startObserver() {
    try {
      const tableBody = await waitForElement(YOUPIN_CONSTANTS.SELECTORS.TABLE_BODY);

      observer = new MutationObserver(handleMutations);
      observer.observe(tableBody, {
        childList: true,
        subtree: true
      });

      // 处理已存在的元素
      processExistingUserBoxes();
    } catch (error) {
      console.error(`${YOUPIN_CONSTANTS.LOG_PREFIX} ❌ 启动Observer失败:`, error);
    }
  }

  // ========== 右键菜单交互 ==========

  /**
   * 记录右键点击位置
   */
  document.addEventListener('contextmenu', (event) => {
    lastClickPosition = { x: event.clientX, y: event.clientY };
  }, true);

  /**
   * 监听来自background的消息
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openRemarkDialog') {
      openRemarkDialog();
      sendResponse({ success: true });
    }

    return true; // 保持消息通道开启
  });

  /**
   * 打开备注编辑对话框
   */
  async function openRemarkDialog() {
    // 根据坐标找到元素
    const element = document.elementFromPoint(lastClickPosition.x, lastClickPosition.y);

    // 首先尝试找到 userInfoBox
    let userBox = element ? element.closest(YOUPIN_CONSTANTS.SELECTORS.USER_INFO_BOX) : null;

    // 如果没找到 userInfoBox，尝试找到 td，然后在 td 内查找 userInfoBox
    if (!userBox) {
      const tdElement = element ? element.closest('td.ant-table-cell') : null;
      if (tdElement) {
        userBox = tdElement.querySelector(YOUPIN_CONSTANTS.SELECTORS.USER_INFO_BOX);
      }
    }

    // 检查是否找到了 userBox 并且有 userId
    if (!userBox || !userBox.dataset[YOUPIN_CONSTANTS.DATA_ATTRS.USER_ID]) {
      alert('请在用户信息区域右键点击');
      return;
    }

    const userId = userBox.dataset[YOUPIN_CONSTANTS.DATA_ATTRS.USER_ID];
    await showRemarkDialog(userId);
  }

  /**
   * 显示备注编辑对话框
   */
  async function showRemarkDialog(userId) {
    // 获取现有备注
    const existingRemark = await StorageManager.getRemark(userId);

    // 创建模态框
    const modal = document.createElement('div');
    modal.className = YOUPIN_CONSTANTS.CSS_CLASSES.MODAL;
    modal.innerHTML = `
      <div class="${YOUPIN_CONSTANTS.CSS_CLASSES.MODAL_CONTENT}">
        <h3>为用户 ${userId} 添加备注</h3>
        <input type="text"
               id="youpin-remark-input"
               placeholder="输入备注内容"
               value="${existingRemark?.remark || ''}"
               maxlength="${YOUPIN_CONSTANTS.DEFAULTS.REMARK_MAX_LENGTH}">
        <div class="color-selector">
          <label>选择颜色:</label>
          <input type="color"
                 id="youpin-color-input"
                 value="${existingRemark?.color || YOUPIN_CONSTANTS.DEFAULTS.COLOR}">
        </div>
        <div class="modal-actions">
          <button id="youpin-save-btn">保存</button>
          <button id="youpin-delete-btn"
                  style="display: ${existingRemark ? 'inline-block' : 'none'}">删除</button>
          <button id="youpin-cancel-btn">取消</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 绑定事件
    setupDialogEvents(modal, userId);

    // 聚焦输入框
    setTimeout(() => {
      const input = modal.querySelector('#youpin-remark-input');
      input?.focus();
    }, 100);
  }

  /**
   * 设置对话框事件
   */
  function setupDialogEvents(modal, userId) {
    const saveBtn = modal.querySelector('#youpin-save-btn');
    const deleteBtn = modal.querySelector('#youpin-delete-btn');
    const cancelBtn = modal.querySelector('#youpin-cancel-btn');
    const remarkInput = modal.querySelector('#youpin-remark-input');
    const colorInput = modal.querySelector('#youpin-color-input');

    // 保存
    saveBtn.addEventListener('click', async () => {
      const remark = remarkInput.value.trim();
      const color = colorInput.value;

      if (remark) {
        await StorageManager.saveRemark(userId, remark, color);
        await refreshUserDisplay(userId);
        modal.remove();
      } else {
        alert('请输入备注内容');
      }
    });

    // 删除
    deleteBtn.addEventListener('click', async () => {
      if (confirm('确定删除该用户的备注吗？')) {
        await StorageManager.deleteRemark(userId);
        await refreshUserDisplay(userId);
        modal.remove();
      }
    });

    // 取消
    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });

    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // 回车保存
    remarkInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveBtn.click();
      }
    });
  }

  /**
   * 刷新指定用户的显示
   */
  async function refreshUserDisplay(userId) {
    // 通过 userInfoBox 的 data-youpin-user-id 找到所有该用户的元素
    // 注意：dataset API 使用 camelCase，但 HTML 属性是 kebab-case
    const userBoxes = document.querySelectorAll(
      `[data-youpin-user-id="${userId}"]`
    );

    for (const element of userBoxes) {
      // 检查是 userInfoBox 还是 ID 容器
      if (element.classList.contains('user-info-box___hkAd1')) {
        // 这是 userInfoBox
        const tdParent = element.closest('td');
        if (!tdParent) continue;

        // 找到并移除该 td 下的旧 ID 容器
        const oldContainers = tdParent.querySelectorAll(`.${YOUPIN_CONSTANTS.CSS_CLASSES.USER_ID_CONTAINER}`);
        oldContainers.forEach(c => c.remove());

        // 重置标记（强制重新处理）
        delete element.dataset[YOUPIN_CONSTANTS.DATA_ATTRS.PROCESSED];

        // 提取昵称
        const divs = element.querySelectorAll('div');
        if (divs.length < 2) continue;

        const nicknameDiv = divs[divs.length - 1];
        const nickname = nicknameDiv.textContent.trim();

        if (nickname) {
          // 重新注入用户信息
          await injectUserInfo(element, nickname);
        }
      } else if (element.classList.contains(YOUPIN_CONSTANTS.CSS_CLASSES.USER_ID_CONTAINER)) {
        // 这是旧的 ID 容器，直接移除（已经在上面的逻辑中处理）
        // 这里只是为了清理可能遗留的容器
        element.remove();
      }
    }
  }

  // ========== 初始化 ==========

  /**
   * 延迟重试处理（用于处理页面数据延迟加载的情况）
   */
  function retryProcessExistingBoxes() {
    // 等待3秒后再次尝试处理
    setTimeout(() => {
      if (userDataCache.size > 0) {
        const unprocessedBoxes = document.querySelectorAll(
          `${YOUPIN_CONSTANTS.SELECTORS.USER_INFO_BOX}:not([data-${YOUPIN_CONSTANTS.DATA_ATTRS.PROCESSED}])`
        );

        if (unprocessedBoxes.length > 0) {
          unprocessedBoxes.forEach(box => processUserBox(box));
        }
      }
    }, 3000);
  }

  /**
   * 启动轮询检查（作为MutationObserver的补充）
   */
  function startPolling() {
    setInterval(() => {
      if (userDataCache.size === 0) {
        return; // 没有缓存数据，不处理
      }

      const unprocessedBoxes = document.querySelectorAll(
        `${YOUPIN_CONSTANTS.SELECTORS.USER_INFO_BOX}:not([data-${YOUPIN_CONSTANTS.DATA_ATTRS.PROCESSED}])`
      );

      if (unprocessedBoxes.length > 0) {
        unprocessedBoxes.forEach(box => processUserBox(box));
      }
    }, 2000); // 每2秒检查一次
  }

  /**
   * 初始化插件
   */
  function init() {
    // 检查是否已初始化
    if (isInitialized) {
      console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 已初始化，跳过重复执行`);
      return;
    }

    // 检查是否在市场页面
    const isMarketPage = window.location.pathname.includes('/market/') ||
                        window.location.pathname.includes('goods-list');

    if (!isMarketPage) {
      console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 非市场页面，等待路由变化`);
      return;
    }

    console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 初始化插件`);

    // 1. 注入API拦截脚本
    injectFetchInterceptor();

    // 2. 启动DOM监听
    startObserver();

    // 3. 延迟重试（防止页面加载慢）
    retryProcessExistingBoxes();

    // 4. 启动轮询检查（补充MutationObserver）
    startPolling();

    // 标记已初始化
    isInitialized = true;
    console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 插件初始化完成`);
  }

  /**
   * 启动URL变化监听（用于SPA路由）
   */
  function startUrlWatcher() {
    let lastUrl = location.href;

    urlWatcher = new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 检测到URL变化:`, lastUrl, '→', url);
        lastUrl = url;

        // 检查是否是市场页面
        const isMarketPage = url.includes('/market/') || url.includes('goods-list');

        if (isMarketPage && !isInitialized) {
          // 如果跳转到市场页面且还未初始化，立即初始化
          console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 检测到进入市场页面，开始初始化`);
          init();
        } else if (isMarketPage && isInitialized) {
          // 如果已初始化，重新处理DOM（可能DOM完全刷新了）
          console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} 市场页面路由切换，重新处理现有元素`);

          // 给DOM一点时间渲染
          setTimeout(() => {
            processExistingUserBoxes();
          }, 500);
        }
      }
    });

    // 监听整个document的变化（包括history.pushState）
    urlWatcher.observe(document, {
      subtree: true,
      childList: true
    });

    console.log(`${YOUPIN_CONSTANTS.LOG_PREFIX} URL监听器已启动`);
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      startUrlWatcher();
    });
  } else {
    init();
    startUrlWatcher();
  }

  // 暴露全局函数供调试使用
  window.youpinDebug = {
    getCache: () => userDataCache,
    processAll: () => processExistingUserBoxes(),
    reprocess: () => {
      document.querySelectorAll(`[data-${YOUPIN_CONSTANTS.DATA_ATTRS.PROCESSED}]`).forEach(box => {
        delete box.dataset[YOUPIN_CONSTANTS.DATA_ATTRS.PROCESSED];
        const display = box.querySelector(`.${YOUPIN_CONSTANTS.CSS_CLASSES.USER_ID_CONTAINER}`);
        if (display) display.remove();
      });
      processExistingUserBoxes();
    }
  };

})();
