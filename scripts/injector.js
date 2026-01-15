// API拦截脚本 - 注入到页面上下文中
(function() {
  'use strict';

  console.log('[YouPin Ext] ✅ injector.js 已注入');

  // 保存原始fetch
  const originalFetch = window.fetch;

  // 劫持fetch方法
  window.fetch = async function(...args) {
    try {
      const url = args[0];

      // 调用原始fetch
      const response = await originalFetch.apply(this, args);

      // 检查是否是目标API
      const isOnSaleAPI = typeof url === 'string' && url.includes('queryOnSaleCommodityList');
      const isOnLeaseAPI = typeof url === 'string' && url.includes('queryOnLeaseCommodityList');
      const isPurchaseAPI = typeof url === 'string' && url.includes('getTemplatePurchaseOrderListPC');

      if (isOnSaleAPI || isOnLeaseAPI || isPurchaseAPI) {
        // 克隆响应以避免消耗原始流
        const clonedResponse = response.clone();

        // 异步处理数据提取
        clonedResponse.json().then(data => {
          try {
            // 提取用户数据
            const userMap = {};

            // 处理在售/在租的数据结构（注意：API返回的是大写 Data）
            if ((isOnSaleAPI || isOnLeaseAPI) && data && data.Data) {
              if (Array.isArray(data.Data)) {
                data.Data.forEach((item) => {
                  if (item.userId) {
                    // 同时缓存用户昵称和店铺名称
                    if (item.userNickName) {
                      userMap[item.userNickName] = item.userId;
                    }
                    if (item.storeName && item.storeName !== item.userNickName) {
                      userMap[item.storeName] = item.userId;
                    }
                  }
                });
              }
            }
            // 处理求购的数据结构（注意：求购API返回的是小写 data.data.purchaseOrderResponseList）
            else if (isPurchaseAPI && data && data.data && data.data.purchaseOrderResponseList) {
              if (Array.isArray(data.data.purchaseOrderResponseList)) {
                data.data.purchaseOrderResponseList.forEach((item) => {
                  if (item.userId && item.userName) {
                    // 求购页面使用 userName 字段
                    userMap[item.userName] = item.userId;
                  }
                });
              }
            }

            if (Object.keys(userMap).length > 0) {
              // 通过自定义事件传递给content script
              window.dispatchEvent(new CustomEvent('youpinUserData', {
                detail: userMap
              }));
            }
          } catch (err) {
            console.error('[YouPin Ext] ❌ 解析API数据失败:', err);
          }
        }).catch(err => {
          console.error('[YouPin Ext] ❌ 读取响应失败:', err);
        });
      }

      // 返回原始响应
      return response;
    } catch (error) {
      console.error('[YouPin Ext] ❌ fetch拦截错误:', error);
      throw error;
    }
  };

  console.log('[YouPin Ext] ✅ fetch劫持已安装');

  // 同时劫持XMLHttpRequest（备用方案）
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._youpinUrl = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    const isOnSaleAPI = this._youpinUrl && this._youpinUrl.includes('queryOnSaleCommodityList');
    const isOnLeaseAPI = this._youpinUrl && this._youpinUrl.includes('queryOnLeaseCommodityList');
    const isPurchaseAPI = this._youpinUrl && this._youpinUrl.includes('getTemplatePurchaseOrderListPC');

    if (isOnSaleAPI || isOnLeaseAPI || isPurchaseAPI) {
      this.addEventListener('load', function() {
        try {
          let data;
          // 支持所有响应类型
          if (this.responseType === 'json' || this.responseType === '') {
            // responseType 为 'json' 时，response 已经是对象
            // responseType 为 '' 时，需要手动解析 responseText
            data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          } else if (this.responseType === 'text') {
            data = JSON.parse(this.responseText);
          } else {
            return;
          }

          const userMap = {};

          // 处理在售/在租的数据结构（注意：API返回的是大写 Data）
          if ((isOnSaleAPI || isOnLeaseAPI) && data && data.Data && Array.isArray(data.Data)) {
            data.Data.forEach(item => {
              if (item.userId) {
                if (item.userNickName) {
                  userMap[item.userNickName] = item.userId;
                }
                if (item.storeName && item.storeName !== item.userNickName) {
                  userMap[item.storeName] = item.userId;
                }
              }
            });
          }
          // 处理求购的数据结构（注意：求购API返回的是小写 data，然后是 data.purchaseOrderResponseList）
          else if (isPurchaseAPI && data && data.data && data.data.purchaseOrderResponseList && Array.isArray(data.data.purchaseOrderResponseList)) {
            data.data.purchaseOrderResponseList.forEach(item => {
              if (item.userId && item.userName) {
                userMap[item.userName] = item.userId;
              }
            });
          }

          if (Object.keys(userMap).length > 0) {
            window.dispatchEvent(new CustomEvent('youpinUserData', {
              detail: userMap
            }));
          }
        } catch (err) {
          console.error('[YouPin Ext] (XHR) ❌ 解析失败:', err);
        }
      });
    }

    return originalXHRSend.apply(this, args);
  };

  console.log('[YouPin Ext] ✅ XHR劫持已安装');
})();
