// 简化版 popup.js - 只保留核心功能

let statusDiv, pluginStatusDiv, testAIBtn; // 提升到全局作用域

document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const openSidebarBtn = document.getElementById('open-sidebar-btn');
    testAIBtn = document.getElementById('test-ai-btn');
    const settingsBtn = document.getElementById('settings-btn');
    statusDiv = document.getElementById('status');
    pluginStatusDiv = document.getElementById('plugin-status');

    // 绑定事件
    openSidebarBtn.addEventListener('click', openSidebar);
    testAIBtn.addEventListener('click', testAI);
    settingsBtn.addEventListener('click', openSettings);

    // 初始化
    checkPluginStatus();
});

// 打开侧边栏
async function openSidebar() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // 检查是否为支持的AI平台
        const supportedPlatforms = ['claude.ai', 'chatgpt.com', 'openai.com'];
        const isSupported = supportedPlatforms.some(platform => tab.url.includes(platform));
        
        if (!isSupported) {
            showStatus('⚠️ 请在Claude.ai或ChatGPT页面使用此功能', 'error');
            return;
        }

        showStatus('🚀 正在打开侧边栏...', 'loading');

        // 先重新加载配置，确保使用最新AI设置
        try {
            await chrome.runtime.sendMessage({ action: 'reload_config' });
        } catch (configError) {
            console.warn('配置重新加载失败:', configError);
        }

        // 检测content script是否已加载
        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        } catch (pingError) {
            showStatus('🔄 页面脚本未加载，请刷新页面后重试', 'error');
            return;
        }

        // 注入侧边栏
        await chrome.tabs.sendMessage(tab.id, { 
            action: 'OPEN_SIDEBAR' 
        });

        showStatus('✅ 侧边栏已打开', 'success');
        
        // 3秒后关闭popup
        setTimeout(() => {
            window.close();
        }, 1500);

    } catch (error) {
        console.error('打开侧边栏失败:', error);
        
        // 特殊处理连接失败的情况
        if (error.message.includes('Could not establish connection') || 
            error.message.includes('Receiving end does not exist')) {
            showStatus('🔄 页面未就绪，请刷新页面后重试', 'error');
        } else {
            showStatus('❌ 打开侧边栏失败: ' + error.message, 'error');
        }
    }
}

// 测试AI分析
function testAI() {
    const originalText = testAIBtn.textContent;
    testAIBtn.disabled = true;
    testAIBtn.textContent = '🔄 测试中...';
    
    showStatus('🤖 正在测试AI分析...', 'loading');
    
    // 先重新加载配置，确保使用最新设置
    chrome.runtime.sendMessage({ action: 'reload_config' }, (configResponse) => {
        if (configResponse && configResponse.success) {
            console.log('✅ 配置已重新加载');
        }
        
        // 继续AI测试
        performAITest(originalText);
    });
}

function performAITest(originalText) {
    // 测试数据
    const testDialogue = [
        { role: 'user', content: '你好，我想学习Python编程', index: 0 },
        { role: 'assistant', content: '很好的选择！Python是一门优秀的编程语言，建议从基础语法开始学习', index: 1 },
        { role: 'user', content: '能详细说说学习路径吗？', index: 2 },
        { role: 'assistant', content: '当然！建议按以下顺序：1. 基础语法 2. 数据结构 3. 函数和模块 4. 实际项目', index: 3 }
    ];
    
    // 发送到Background Script测试
    chrome.runtime.sendMessage({
        action: 'analyze_themes',
        dialogue: testDialogue
    }, (response) => {
        testAIBtn.disabled = false;
        testAIBtn.textContent = originalText;
        
        if (chrome.runtime.lastError) {
            showStatus('❌ Background Script通信失败', 'error');
            return;
        }
        
        if (response && response.success) {
            const isAI = !response.data._fallback;
            const method = isAI ? 'AI分析' : '问题导航';
            const nodes = response.data.nodes?.length || 0;
            
            if (isAI) {
                showStatus(`✅ AI测试成功！生成${nodes}个主题`, 'success');
            } else {
                showStatus(`⚠️ AI失败，回退到${method}，生成${nodes}个主题`, 'warning');
            }
        } else {
            showStatus('❌ AI测试失败', 'error');
        }
        
        setTimeout(hideStatus, 4000);
    });
}

// 打开AI设置
function openSettings() {
    chrome.runtime.openOptionsPage();
}

// 检查插件状态
async function checkPluginStatus() {
    const pluginStatusDiv = document.getElementById('plugin-status');
    if (!pluginStatusDiv) {
        console.error('找不到 plugin-status 元素');
        return;
    }

    try {
        // 检查background script
        const response = await chrome.runtime.sendMessage({ action: 'ping' });
        
        if (response && response.success) {
            pluginStatusDiv.textContent = '✅ 插件正常运行';
            pluginStatusDiv.style.color = '#166534';
        } else {
            pluginStatusDiv.textContent = '⚠️ Background Script异常';
            pluginStatusDiv.style.color = '#dc2626';
        }
    } catch (error) {
        pluginStatusDiv.textContent = '❌ 插件状态检查失败';
        pluginStatusDiv.style.color = '#dc2626';
        console.error('插件状态检查失败:', error);
    }

    // 检查当前页面和content script
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // 检查是否为支持的AI平台
        const supportedPlatforms = ['claude.ai', 'chatgpt.com', 'openai.com'];
        const currentPlatform = supportedPlatforms.find(platform => tab.url.includes(platform));
        
        if (currentPlatform) {
            const platformName = currentPlatform === 'claude.ai' ? 'Claude' : 'ChatGPT';
            pluginStatusDiv.textContent += ` | ✅ ${platformName}页面`;
            
            // 检查content script是否已加载
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                pluginStatusDiv.textContent += ' | ✅ 脚本已加载';
            } catch (contentError) {
                pluginStatusDiv.textContent += ' | ⚠️ 脚本未加载，请刷新页面';
                pluginStatusDiv.style.color = '#dc2626';
            }
        } else {
            pluginStatusDiv.textContent += ' | ⚠️ 非支持的AI平台';
        }
    } catch (error) {
        console.error('页面检查失败:', error);
    }
}

// 显示状态
function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}

// 隐藏状态
function hideStatus() {
    statusDiv.className = 'status hidden';
}