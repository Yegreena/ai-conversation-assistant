// =================================================================================================
// MAIN CONTENT SCRIPT - 主入口文件，检测平台并加载对应适配器
// =================================================================================================

console.log('🚀 AI对话主题助手启动中...');

// 检测当前平台
function detectPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('claude.ai')) {
        return 'claude';
    } else if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
        return 'chatgpt';
    }
    
    return null;
}

// 动态加载对应的适配器
async function loadAdapter(platform) {
    try {
        let adapterModule;
        
        switch (platform) {
            case 'claude':
                console.log('📱 检测到Claude平台，加载Claude适配器...');
                adapterModule = await import(chrome.runtime.getURL('adapters/claude-adapter.js'));
                return new adapterModule.ClaudeAdapter();
                
            case 'chatgpt':
                console.log('📱 检测到ChatGPT平台，加载ChatGPT适配器...');
                adapterModule = await import(chrome.runtime.getURL('adapters/chatgpt-adapter.js'));
                return new adapterModule.ChatGPTAdapter();
                
            default:
                console.warn('⚠️ 未识别的平台:', window.location.hostname);
                return null;
        }
    } catch (error) {
        console.error('❌ 加载适配器失败:', error);
        return null;
    }
}

// 检查扩展上下文是否有效
function isExtensionContextValid() {
    try {
        return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (error) {
        return false;
    }
}

// 主初始化函数
async function initializeExtension() {
    // 检查扩展上下文
    if (!isExtensionContextValid()) {
        console.warn('⚠️ 扩展上下文无效，可能需要刷新页面');
        return;
    }

    // 检查是否已经初始化过
    if (window.mindmapExtensionInitialized) {
        console.log('⚠️ 扩展已初始化，跳过重复初始化');
        return;
    }
    
    // 标记为已初始化
    window.mindmapExtensionInitialized = true;
    
    try {
        // 检测平台
        const platform = detectPlatform();
        
        if (!platform) {
            console.log('ℹ️ 当前页面不支持AI对话主题助手');
            return;
        }
        
        // 加载并初始化适配器
        const adapter = await loadAdapter(platform);
        
        if (adapter) {
            console.log(`✅ ${platform.toUpperCase()}适配器加载成功`);
            
            // 初始化适配器
            await adapter.init();
            
            // 将适配器实例保存到全局，方便调试和其他脚本调用
            window.mindmapAdapter = adapter;
            
            console.log('🎉 AI对话主题助手初始化完成');
        } else {
            console.error('❌ 适配器初始化失败');
        }
        
    } catch (error) {
        console.error('❌ 扩展初始化失败:', error);
        
        if (error.message && error.message.includes('Extension context invalidated')) {
            console.warn('⚠️ 扩展上下文已失效，请刷新页面重新加载扩展');
            // 可以显示一个用户提示
            showExtensionContextError();
        }
    }
}

// 显示扩展上下文错误提示
function showExtensionContextError() {
    // 创建一个简单的提示框
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fee2e2;
        border: 1px solid #fecaca;
        color: #dc2626;
        padding: 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        max-width: 300px;
    `;
    notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px;">⚠️ 扩展需要重新加载</div>
        <div>请刷新页面以重新激活AI对话主题助手</div>
    `;
    
    document.body.appendChild(notification);
    
    // 10秒后自动移除
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 10000);
}

// 等待页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    // 如果页面已经加载完成，直接初始化
    initializeExtension();
}

// 监听来自popup和background script的消息
chrome.runtime.onMessage?.addListener((request, sender, sendResponse) => {
    console.log('📨 收到消息:', request.action);
    
    // 检查扩展上下文
    if (!isExtensionContextValid()) {
        console.warn('⚠️ 扩展上下文无效，无法处理消息');
        sendResponse({ 
            success: false, 
            error: '扩展上下文无效，请刷新页面' 
        });
        return;
    }
    
    if (request.action === 'ping') {
        // 健康检查
        sendResponse({ 
            success: true, 
            platform: detectPlatform(),
            initialized: !!window.mindmapAdapter,
            contextValid: isExtensionContextValid()
        });
        return;
    }
    
    if (request.action === 'OPEN_SIDEBAR') {
        // 从popup打开侧边栏
        console.log('📨 处理OPEN_SIDEBAR请求');
        console.log('🔍 当前适配器状态:', !!window.mindmapAdapter);
        
        if (window.mindmapAdapter) {
            console.log('✅ 适配器存在，显示侧边栏');
            window.mindmapAdapter.showSidebar();
            
            // 检查是否有数据，如果没有则开始分析
            const hasTopics = window.mindmapAdapter.topics && window.mindmapAdapter.topics.length > 0;
            console.log('📊 当前主题数量:', window.mindmapAdapter.topics?.length || 0);
            
            if (!hasTopics) {
                console.log('🔍 没有主题数据，开始分析');
                window.mindmapAdapter.startAnalysis();
            } else {
                console.log('✅ 已有主题数据，直接显示');
            }
            
            sendResponse({ success: true });
        } else {
            console.error('❌ 适配器未初始化');
            sendResponse({ success: false, error: '适配器未初始化' });
        }
        return;
    }
    
    if (request.action === 'toggleSidebar') {
        if (window.mindmapAdapter) {
            window.mindmapAdapter.toggleSidebar();
        }
        sendResponse({ success: true });
        return;
    }
    
    if (request.action === 'showSidebar') {
        if (window.mindmapAdapter) {
            window.mindmapAdapter.showSidebar();
        }
        sendResponse({ success: true });
        return;
    }
    
    sendResponse({ success: false, error: '未知消息类型' });
});

// 错误处理
window.addEventListener('error', (event) => {
    if (event.error && event.error.message.includes('mindmap')) {
        console.error('🐛 AI对话主题助手错误:', event.error);
    }
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (window.mindmapAdapter) {
        // 可以在这里添加清理逻辑
        console.log('🧹 清理AI对话主题助手资源');
    }
});

console.log('📋 content.js主入口文件加载完成');

// 全局调试和重新初始化方法
window.debugMindmapExtension = function() {
    console.log('🔍 扩展状态诊断:');
    console.log('1. 扩展已初始化:', !!window.mindmapExtensionInitialized);
    console.log('2. 适配器存在:', !!window.mindmapAdapter);
    console.log('3. 适配器类型:', window.mindmapAdapter?.constructor.name);
    console.log('4. 当前平台:', detectPlatform());
    console.log('5. 侧边栏元素存在:', !!document.getElementById('claude-mindmap-sidebar'));
    console.log('6. Chrome扩展上下文:', isExtensionContextValid());
    
    if (window.mindmapAdapter) {
        console.log('7. 对话数据数量:', window.mindmapAdapter.dialogue?.length || 0);
        console.log('8. 主题数据数量:', window.mindmapAdapter.topics?.length || 0);
    }
};

window.forceReinitMindmap = async function() {
    console.log('🔄 强制重新初始化扩展...');
    
    // 清理现有状态
    window.mindmapExtensionInitialized = false;
    window.mindmapAdapter = null;
    
    // 移除现有侧边栏
    const existingSidebar = document.getElementById('claude-mindmap-sidebar');
    if (existingSidebar) {
        existingSidebar.remove();
    }
    
    // 重新初始化
    await initializeExtension();
    
    console.log('✅ 重新初始化完成');
};