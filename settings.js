// settings.js - AI设置页面逻辑

// 当前选中的提供商
let currentProvider = 'kimi';
const PROVIDERS = ['kimi', 'openai', 'claude', 'local'];

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 AI设置页面加载');
    await loadSettings();
    setupEventListeners();
});

// 加载保存的设置
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get([
            'aiProvider', 
            'apiKeys', 
            'customEndpoints'
        ]);
        
        console.log('读取到配置:', result);

        // 1. 加载并设置当前提供商
        currentProvider = result.aiProvider || 'kimi';
        selectProvider(currentProvider);
        
        // 2. 加载API密钥
        const apiKeys = result.apiKeys || {};
        PROVIDERS.forEach(provider => {
            const input = document.getElementById(`${provider}-api-key`);
            if (input) {
                input.value = apiKeys[provider] || '';
            }
        });
        
        // 3. 加载自定义端点
        const customEndpoints = result.customEndpoints || {};
        PROVIDERS.forEach(provider => {
            const endpointInput = document.getElementById(`${provider}-endpoint`);
            if (endpointInput) {
                endpointInput.value = customEndpoints[provider] || '';
            }
        });
        
        console.log('✅ 设置加载完成');
    } catch (error) {
        console.error('❌ 设置加载失败:', error);
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 为所有提供商卡片添加点击事件
    document.querySelectorAll('.provider-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // 防止输入框的点击触发卡片选择
            if (e.target.tagName === 'INPUT') return;
            const provider = card.dataset.provider;
            selectProvider(provider);
            // 选择后立即保存提供商设置
            saveSettings();
        });
    });
    
    // 为所有输入框添加失焦时自动保存的事件
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('blur', debounce(saveSettings, 500));
    });

    // 为保存和重置按钮绑定事件
    document.getElementById('save-btn').addEventListener('click', saveSettings);
    document.getElementById('reset-btn').addEventListener('click', resetSettings);
}

// UI更新：选择一个提供商
function selectProvider(provider) {
    currentProvider = provider;
    document.querySelectorAll('.provider-card').forEach(card => {
        card.classList.toggle('active', card.dataset.provider === provider);
    });
    console.log(`✅ 已选择提供商: ${provider}`);
}

// 保存所有设置
async function saveSettings() {
    try {
        console.log('💾 保存设置...');
        
        // 1. 收集API密钥
        const apiKeys = {};
        PROVIDERS.forEach(provider => {
            const input = document.getElementById(`${provider}-api-key`);
            if (input) {
                apiKeys[provider] = input.value.trim();
            }
        });
        
        // 2. 收集自定义端点
        const customEndpoints = {};
        PROVIDERS.forEach(provider => {
            const endpointInput = document.getElementById(`${provider}-endpoint`);
            if (endpointInput && endpointInput.value.trim()) {
                customEndpoints[provider] = endpointInput.value.trim();
            }
        });
        
        // 3. 准备要保存的数据
        const settingsToSave = {
            aiProvider: currentProvider,
            apiKeys: apiKeys,
            customEndpoints: customEndpoints,
            lastSaved: new Date().toISOString()
        };

        // 4. 保存到chrome.storage
        await chrome.storage.local.set(settingsToSave);
        
        console.log('✅ 设置保存成功:', settingsToSave);
        showNotification('设置已自动保存！', 'success');
        
        // 5. 通知background脚本重新加载配置，确保立即生效
        chrome.runtime.sendMessage({ action: 'reload_config' });
        
    } catch (error) {
        console.error('❌ 设置保存失败:', error);
        showNotification('保存失败: ' + error.message, 'error');
    }
}

// 重置设置为默认值
async function resetSettings() {
    if (!confirm('确定要重置所有设置为默认值吗？这将清除您填写的所有API密钥和自定义端点。')) {
        return;
    }
    
    try {
        console.log('🔄 重置设置...');
        
        // 仅清除本扩展的设置，而不是整个local storage
        await chrome.storage.local.remove(['aiProvider', 'apiKeys', 'customEndpoints', 'lastSaved']);
        
        // UI重置：清空所有输入框并重新加载（会加载默认值）
        document.querySelectorAll('input').forEach(input => input.value = '');
        await loadSettings();
        
        console.log('✅ 设置已重置为默认值');
        showNotification('设置已重置！', 'success');
        
        // 通知background脚本重新加载配置
        chrome.runtime.sendMessage({ action: 'reload_config' });
        
    } catch (error) {
        console.error('❌ 设置重置失败:', error);
        showNotification('重置失败: ' + error.message, 'error');
    }
}

// 显示一个短暂的通知
function showNotification(message, type = 'info') {
    let notification = document.getElementById('settings-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'settings-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            z-index: 1000;
            transform: translateX(120%);
            transition: transform 0.4s ease-in-out;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        document.body.appendChild(notification);
    }
    
    const styles = {
        success: 'background: #48bb78; color: white;',
        error: 'background: #f56565; color: white;'
    };
    
    notification.style.cssText += styles[type] || 'background: #4299e1; color: white;';
    notification.textContent = message;
    
    notification.style.transform = 'translateX(0)';
    
    setTimeout(() => {
        notification.style.transform = 'translateX(120%)';
    }, 3000);
}

// 工具函数：防抖
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
