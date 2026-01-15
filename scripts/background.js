// Background Service Worker

console.log('[YouPin Ext] Background service worker 已启动');

// 安装时创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  console.log('[YouPin Ext] 插件已安装,创建右键菜单');

  chrome.contextMenus.create({
    id: 'youpin-add-remark',
    title: '添加/编辑用户备注',
    contexts: ['page'],
    documentUrlPatterns: ['https://www.youpin898.com/*']
  });
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('[YouPin Ext] 右键菜单被点击:', info.menuItemId);

  if (info.menuItemId === 'youpin-add-remark') {
    // 向当前标签页的content script发送消息
    chrome.tabs.sendMessage(tab.id, {
      action: 'openRemarkDialog'
    }).catch(err => {
      console.error('[YouPin Ext] 发送消息失败:', err);
    });
  }
});

// 监听来自content script的消息（用于调试）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[YouPin Ext] 收到消息:', message);

  // 可以在这里处理其他消息
  if (message.action === 'log') {
    console.log('[YouPin Ext] Content Script日志:', message.data);
  }

  sendResponse({ success: true });
  return true;
});
