// =================================================================================================
// CHATGPT ADAPTER - ChatGPT平台专用适配器
// =================================================================================================

import { BaseAdapter } from './base-adapter.js';

export class ChatGPTAdapter extends BaseAdapter {
    constructor() {
        super();
        this.platform = 'chatgpt';
    }

    // ChatGPT特有的选择器
    getMessageSelector() {
        return '[data-message-author-role]';
    }

    getDialogueContainer() {
        return 'main';
    }

    getUserMessageSelector() {
        return '[data-message-author-role="user"]';
    }

    getAssistantMessageSelector() {
        return '[data-message-author-role="assistant"]';
    }

    // ChatGPT特有的页面就绪检测
    async waitForPageReady() {
        let retries = 0;
        const maxRetries = 30;
        
        while (retries < maxRetries) {
            // 检查ChatGPT特有的元素
            const container = document.querySelector(this.getDialogueContainer());
            const messages = document.querySelectorAll(this.getMessageSelector());
            
            if (container && messages.length > 0) {
                console.log('✅ ChatGPT页面已就绪');
                return;
            }
            
            // 也检查是否有对话历史
            const conversationList = document.querySelector('[role="navigation"]');
            if (container && conversationList) {
                console.log('✅ ChatGPT页面已就绪（空对话）');
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries++;
        }
        
        console.warn('⚠️ 等待ChatGPT页面超时');
    }

    // ChatGPT特有的对话提取逻辑
    extractDialogue() {
        const dialogue = [];
        const messages = document.querySelectorAll(this.getMessageSelector());
        
        console.log(`🔍 找到 ${messages.length} 个ChatGPT消息元素`);
        
        messages.forEach((messageElement, index) => {
            try {
                const messageData = this.parseChatGPTMessage(messageElement, index);
                if (messageData) {
                    dialogue.push(messageData);
                }
            } catch (error) {
                console.warn(`⚠️ 解析ChatGPT消息 ${index} 失败:`, error);
            }
        });
        
        console.log(`✅ 成功提取 ${dialogue.length} 条ChatGPT对话`);
        return dialogue;
    }

    parseChatGPTMessage(messageElement, index) {
        // 获取消息角色
        const role = messageElement.getAttribute('data-message-author-role');
        
        if (!role || !['user', 'assistant'].includes(role)) {
            return null;
        }
        
        // 提取消息内容
        const content = this.extractTextFromChatGPTElement(messageElement);
        
        if (!content || content.length < 5) return null;
        
        // 为消息元素添加ID，用于导航
        if (!messageElement.dataset.mindmapId) {
            messageElement.dataset.mindmapId = index.toString();
        }
        
        return {
            id: index,
            role: role,
            content: content,
            element: messageElement,
            timestamp: Date.now()
        };
    }

    extractTextFromChatGPTElement(element) {
        // 克隆元素避免修改原始DOM
        const clonedElement = element.cloneNode(true);
        
        // 移除ChatGPT特有的不需要的元素
        const unwantedSelectors = [
            'button',
            '.text-token-text-secondary',
            '[data-testid*="copy"]',
            '.rounded-md.bg-token-surface-secondary',
            '.flex.items-center.gap-2',
            'svg',
            '.sr-only'
        ];
        
        unwantedSelectors.forEach(selector => {
            const unwantedElements = clonedElement.querySelectorAll(selector);
            unwantedElements.forEach(el => el.remove());
        });
        
        // 获取主要内容区域
        let contentElement = clonedElement.querySelector('[class*="markdown"]') || 
                           clonedElement.querySelector('.whitespace-pre-wrap') ||
                           clonedElement;
        
        let text = contentElement.textContent?.trim() || '';
        
        // 清理ChatGPT特有的文本格式
        text = text.replace(/\s+/g, ' ').trim();
        text = text.replace(/^ChatGPT\s*/, ''); // 移除ChatGPT前缀
        text = text.replace(/^\d+\s*\/\s*\d+\s*/, ''); // 移除分页标识
        
        return text;
    }

    // ChatGPT特有的导航功能
    navigateToMessage(messageId) {
        const messageElement = document.querySelector(`[data-mindmap-id="${messageId}"]`);
        if (messageElement) {
            messageElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
            
            // 高亮消息
            this.highlightMessage(messageElement);
            
            return true;
        }
        
        console.warn(`❌ 未找到ChatGPT消息: ${messageId}`);
        return false;
    }

    highlightMessage(messageElement) {
        // 移除之前的高亮
        document.querySelectorAll('.mindmap-highlighted').forEach(el => {
            el.classList.remove('mindmap-highlighted');
        });
        
        // 添加高亮样式
        messageElement.classList.add('mindmap-highlighted');
        
        // 添加统一高亮样式 - 黄色高亮，只高亮文字
        const style = document.createElement('style');
        style.textContent = `
            .mindmap-highlighted {
                background-color: rgba(255, 235, 59, 0.3) !important;
                color: #333 !important;
                padding: 2px 4px !important;
                border-radius: 4px !important;
                transition: all 0.3s ease !important;
                box-shadow: none !important;
                border: none !important;
            }
        `;
        document.head.appendChild(style);
        
        // 3秒后移除高亮
        setTimeout(() => {
            messageElement.classList.remove('mindmap-highlighted');
            style.remove();
        }, 3000);
    }

    // ChatGPT特有的URL处理
    getCurrentUrl() {
        // ChatGPT的URL格式：https://chatgpt.com/c/{conversation-id}
        const pathname = window.location.pathname;
        const conversationId = pathname.split('/c/')[1];
        
        if (conversationId) {
            return `chatgpt_${conversationId}`;
        }
        
        return `chatgpt_${window.location.hostname}${pathname}`;
    }

    // ChatGPT使用基类的默认AI分析方法
    // 如果需要ChatGPT特有的处理，可以在这里覆盖

    // 监听ChatGPT特有的页面事件
    bindEvents() {
        super.bindEvents();
        
        // 监听ChatGPT的新消息
        this.observeChatGPTMessages();
        
        // 监听ChatGPT的对话切换
        this.observeConversationChanges();
    }

    observeChatGPTMessages() {
        // 监听ChatGPT对话容器的变化
        const container = document.querySelector(this.getDialogueContainer());
        if (!container) return;

        const observer = new MutationObserver((mutations) => {
            let hasNewMessage = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE && 
                            node.querySelector && 
                            node.querySelector(this.getMessageSelector())) {
                            hasNewMessage = true;
                        }
                    });
                }
            });
            
            if (hasNewMessage) {
                console.log('🔄 检测到ChatGPT新消息');
                this.handleNewMessage();
            }
        });

        observer.observe(container, {
            childList: true,
            subtree: true
        });
    }

    async handleNewMessage() {
        // ChatGPT消息可能需要更长时间完全加载
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const newDialogue = this.extractDialogue();
        if (this.hasDialogueChanged(newDialogue)) {
            this.dialogue = newDialogue;
            console.log('📝 更新ChatGPT对话内容');
        }
    }

    observeConversationChanges() {
        let currentUrl = window.location.href;
        
        const checkUrlChange = () => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                console.log('🔄 ChatGPT对话切换，重新初始化');
                
                // 清除当前数据
                this.dialogue = [];
                this.topics = [];
                
                // 重新开始分析
                setTimeout(() => {
                    this.startAnalysis();
                }, 2000); // ChatGPT页面切换需要更长时间
            }
        };
        
        // 定期检查URL变化
        setInterval(checkUrlChange, 1000);
        
        // 监听浏览器前进后退
        window.addEventListener('popstate', checkUrlChange);
        
        // 监听ChatGPT侧边栏的对话切换
        const sidebar = document.querySelector('[role="navigation"]');
        if (sidebar) {
            sidebar.addEventListener('click', (e) => {
                // 延迟检查，等待页面切换完成
                setTimeout(checkUrlChange, 1000);
            });
        }
    }

    // ChatGPT特有的页面检测
    async waitForPageReady() {
        let retries = 0;
        const maxRetries = 30;
        
        while (retries < maxRetries) {
            // 检查页面是否为新对话或已有对话
            const isNewChat = window.location.pathname === '/' || 
                             window.location.pathname === '/chat';
            const hasConversation = window.location.pathname.includes('/c/');
            
            if (isNewChat) {
                // 新对话页面，等待输入框出现
                const inputBox = document.querySelector('textarea[placeholder*="Message"]') ||
                               document.querySelector('textarea[data-id="root"]');
                if (inputBox) {
                    console.log('✅ ChatGPT新对话页面已就绪');
                    return;
                }
            } else if (hasConversation) {
                // 已有对话，等待消息加载
                const messages = document.querySelectorAll(this.getMessageSelector());
                if (messages.length > 0) {
                    console.log('✅ ChatGPT对话页面已就绪');
                    return;
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries++;
        }
        
        console.warn('⚠️ 等待ChatGPT页面超时');
    }
}

// 注意：不再自动初始化，由content.js统一管理