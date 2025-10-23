// =================================================================================================
// CLAUDE ADAPTER - Claude.ai平台专用适配器
// =================================================================================================

import { BaseAdapter } from './base-adapter.js';

export class ClaudeAdapter extends BaseAdapter {
    constructor() {
        super();
        this.platform = 'claude';
    }

    // Claude特有的选择器 - 专注于实际消息内容而非对话标题
    getMessageSelector() {
        // Try multiple message selectors - prioritize actual message content
        const selectors = [
            // Look for actual conversation turns with content
            '[data-testid="conversation-turn"]:has([data-testid*="message"])',
            '[data-testid="conversation-turn"]:has(.prose)',
            // Individual message elements
            '[data-testid="user-message"], [data-testid="assistant-message"]',
            '[data-testid="bot-message"]',
            // Content-based selectors
            'div[class*="prose"]:not([class*="title"])',
            'div[class*="whitespace-pre-wrap"]:not([class*="title"])',
            // Generic message containers with content
            '[data-testid="conversation-turn"]',
            '.group:has([data-testid*="message"])',
            '[data-testid^="message"]',
            'div[class*="message"]:not([class*="title"])'
        ];
        
        for (const selector of selectors) {
            const messages = document.querySelectorAll(selector);
            if (messages.length > 0) {
                // Additional validation to ensure we're getting content, not titles
                const hasRealContent = Array.from(messages).some(msg => {
                    const text = msg.textContent?.trim() || '';
                    return text.length > 20 && !this.isConversationTitle(text);
                });
                
                if (hasRealContent) {
                    return selector;
                }
            }
        }
        
        return '[data-testid="conversation-turn"]'; // Fallback
    }

    getDialogueContainer() {
        // Try multiple container selectors in order of preference - focus on actual conversation content
        const containers = [
            // Modern Claude selectors
            '[data-testid="conversation"]',
            '[data-testid="chat-messages"]',
            'main[role="main"]',
            'main[class*="conversation"]',
            'div[class*="conversation"]:not([class*="title"]):not([class*="header"])',
            // Look for any container with message-like content
            'div:has([data-testid*="message"])',
            'div:has([data-testid*="turn"])',
            'div:has(.prose)',
            // General main containers
            'main div:not([class*="sidebar"]):not([class*="header"])',
            'main',
            // Fallback - any large container with text content
            'body > div > div > div' // Common React app structure
        ];
        
        for (const selector of containers) {
            const container = document.querySelector(selector);
            if (container) {
                // Check if this container actually contains conversation content
                const hasConversationContent = 
                    container.querySelector('[data-testid*="message"]') || 
                    container.querySelector('[data-testid*="turn"]') ||
                    container.querySelector('div[class*="prose"]') ||
                    container.querySelector('div[class*="whitespace-pre-wrap"]') ||
                    (container.textContent && container.textContent.length > 100); // Has substantial text content
                
                if (hasConversationContent) {
                    return selector;
                }
            }
        }
        
        // Ultimate fallback - just use main if it exists
        if (document.querySelector('main')) {
            return 'main';
        }
        
        // If no main, use body as last resort
        return 'body';
    }

    getUserMessageSelector() {
        return '[data-testid="user-message"]';
    }

    getAssistantMessageSelector() {
        return '[data-testid="bot-message"]';
    }

    // Claude特有的页面就绪检测
    async waitForPageReady() {
        let retries = 0;
        const maxRetries = 15; // 减少等待时间
        
        while (retries < maxRetries) {
            // 检查Claude特有的元素
            const container = document.querySelector(this.getDialogueContainer());
            
            if (container) {
                return;
            }
            
            // 也检查是否有输入框（表示页面已加载但可能是新对话）
            const inputBox = document.querySelector('div[contenteditable="true"]') ||
                            document.querySelector('textarea[placeholder*="消息"]') ||
                            document.querySelector('textarea');
            
            if (inputBox) {
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries++;
        }
        
        // 不抛出错误，允许继续初始化
    }

    // Claude特有的对话提取逻辑 - 基于之前工作版本的逻辑
    extractDialogue() {
        
        // 检查是否是空对话页面
        const isEmptyConversation = document.querySelector('[data-testid="empty-conversation"]') || 
                                   document.querySelector('.empty-conversation') ||
                                   document.title.includes('New Chat') ||
                                   window.location.pathname === '/chat';
                                   
        if (isEmptyConversation) {
            return [];
        }
        
        const SELECTORS = {
            ai_messages: [
                // 保持原有的优先级选择器（确保向后兼容）
                '[data-testid="assistant-message"]',
                '[data-message-author="assistant"]',
                '[data-role="assistant"]',
                '[role="assistant"]',
                '.assistant-message',
                'div[class*="assistant"]',
                // 针对Claude.ai的完整回答容器
                'div[data-testid="conversation-turn"] div[data-message-author="assistant"]',
                'div[class*="prose"] div[data-message-author="assistant"]'
            ],
            user_messages: [
                // 保持原有的优先级选择器（确保向后兼容）
                '[data-testid="user-message"]',
                '[data-message-author="user"]', 
                '[data-role="user"]',
                '[role="user"]',
                '.user-message',
                'div[class*="user"]',
                // 针对Claude.ai的用户消息容器
                'div[data-testid="conversation-turn"] div[data-message-author="user"]'
            ],
        };

        const userMessages = document.querySelectorAll(SELECTORS.user_messages.join(', '));
        let aiMessages = document.querySelectorAll(SELECTORS.ai_messages.join(', '));

        // 只有在完全找不到AI消息时才使用智能检测
        if (aiMessages.length === 0) {
            
            // 方法1: 查找与用户消息相邻的长文本元素
            const smartAIMessages = [];
            userMessages.forEach(userEl => {
                let nextSibling = userEl.nextElementSibling;
                let attempts = 0;
                while (nextSibling && attempts < 5) {
                    const text = nextSibling.textContent?.trim();
                    if (text && text.length > 100 && !text.includes('用户:') && 
                        !smartAIMessages.includes(nextSibling) &&
                        !this.isConversationTitle(text)) {
                        smartAIMessages.push(nextSibling);
                        break;
                    }
                    nextSibling = nextSibling.nextElementSibling;
                    attempts++;
                }
            });
            
            // 方法2: 基于Claude.ai最新DOM模式（保守策略）
            const commonPatterns = [
                'div[class*="prose"]',           // prose样式容器（Claude常用）
                'div[class*="whitespace-pre-wrap"]', // 预格式化文本容器
                'div[data-testid*="message"]',   // 任何消息容器
                'article',                       // 文章容器
                '[class*="markdown"]',           // markdown渲染容器
                'div[class*="font-claude"]',     // Claude特有字体类
                'div[class*="assistant"]:not([class*="user"])' // 包含assistant但不包含user的类名
            ];
            
            commonPatterns.forEach(pattern => {
                const elements = document.querySelectorAll(pattern);
                elements.forEach(el => {
                    const text = el.textContent?.trim();
                    // 更严格的过滤：避免重复元素和嵌套元素，以及排除思考部分
                    if (text && text.length > 100 && text.length < 5000 && // 长度限制
                        !smartAIMessages.includes(el) && 
                        !Array.from(userMessages).includes(el) &&
                        !smartAIMessages.some(existing => existing.contains(el) || el.contains(existing)) && // 避免嵌套
                        !text.includes('data-testid') && // 避免包含DOM属性的文本
                        !text.startsWith('[') && // 避免包含索引标记的文本
                        !this.isConversationTitle(text)
                    ) {
                        smartAIMessages.push(el);
                    }
                });
            });
            
            // 如果找到了疑似AI消息，创建新的NodeList
            if (smartAIMessages.length > 0) {
                aiMessages = smartAIMessages;
            }
        }
        
        // 去重处理：确保没有重复的元素
        const uniqueUserMessages = Array.from(new Set(userMessages));
        const uniqueAIMessages = Array.from(new Set(aiMessages));
        
        const allMessages = [
            ...uniqueUserMessages.map(el => ({ element: el, role: 'user' })), 
            ...uniqueAIMessages.map(el => ({ element: el, role: 'assistant' }))
        ];
        
        
        // 按DOM顺序排序
        allMessages.sort((a, b) => {
            const pos = a.element.compareDocumentPosition(b.element);
            return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });

        const dialogue = allMessages.map((msg, index) => {
            // 为消息元素添加ID，用于导航
            msg.element.setAttribute('data-mindmap-id', index);
            return {
                id: index,
                role: msg.role,
                content: msg.element.textContent.trim(),
                element: msg.element,
                timestamp: Date.now()
            };
        });

        
        return dialogue;
    }

    parseClaudeMessage(messageElement, index) {
        let role, content;
        
        // Skip if this looks like a conversation title rather than message content
        const allText = messageElement.textContent?.trim();
        if (!allText || allText.length < 10 || this.isConversationTitle(allText)) {
            return null;
        }
        
        // 方法1：通过data-testid识别（增强版）
        const userMessage = messageElement.querySelector('[data-testid="user-message"]') ||
                           messageElement.closest('[data-testid="user-message"]') ||
                           (messageElement.getAttribute('data-testid') === 'user-message' ? messageElement : null);

        const assistantMessage = messageElement.querySelector('[data-testid="assistant-message"]') ||
                                messageElement.querySelector('[data-testid="bot-message"]') ||
                                messageElement.closest('[data-testid="assistant-message"]') ||
                                messageElement.closest('[data-testid="bot-message"]') ||
                                (messageElement.getAttribute('data-testid')?.includes('assistant') ? messageElement : null);
        
        if (userMessage) {
            role = 'user';
            content = this.extractTextFromElement(userMessage);
        } else if (assistantMessage) {
            role = 'assistant';
            content = this.extractTextFromElement(assistantMessage);
        } else {
            // 方法2：寻找内部实际的消息内容元素
            const contentElements = messageElement.querySelectorAll('[data-testid*="message"], .prose, div[class*="whitespace-pre-wrap"]');
            if (contentElements.length > 0) {
                // 尝试找到用户和助手消息
                for (const el of contentElements) {
                    const testId = el.getAttribute('data-testid') || '';
                    if (testId.includes('user')) {
                        role = 'user';
                        content = this.extractTextFromElement(el);
                        break;
                    } else if (testId.includes('assistant') || testId.includes('bot')) {
                        role = 'assistant';
                        content = this.extractTextFromElement(el);
                        break;
                    }
                }
                
                // 如果还是没找到，使用第一个有内容的元素
                if (!content) {
                    for (const el of contentElements) {
                        const text = this.extractTextFromElement(el);
                        if (text && text.length > 10 && !this.isConversationTitle(text)) {
                            content = text;
                            // 尝试根据内容特征判断角色
                            role = this.isUserMessage(el) ? 'user' : 'assistant';
                            break;
                        }
                    }
                }
            } else {
                // 方法3：通过CSS类或位置识别
                if (!allText || allText.length < 10) return null;
                
                // 启发式判断消息类型
                if (this.isUserMessage(messageElement)) {
                    role = 'user';
                    content = allText;
                } else if (this.isAssistantMessage(messageElement)) {
                    role = 'assistant';
                    content = allText;
                } else {
                    // 如果无法确定类型，根据索引交替分配
                    role = index % 2 === 0 ? 'user' : 'assistant';
                    content = allText;
                    console.log(`⚠️ 无法确定消息类型，使用交替分配: ${role}`);
                }
            }
        }
        
        if (!content || content.length < 10 || this.isConversationTitle(content)) return null;
        
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

    extractTextFromElement(element) {
        // 移除代码块、引用等特殊格式，只保留主要文本
        const clonedElement = element.cloneNode(true);
        
        // 移除不需要的元素
        const unwantedSelectors = [
            '.copy-button',
            '.message-actions',
            '[data-testid="copy-button"]',
            'button',
            '.timestamp'
        ];
        
        unwantedSelectors.forEach(selector => {
            const unwantedElements = clonedElement.querySelectorAll(selector);
            unwantedElements.forEach(el => el.remove());
        });
        
        let text = clonedElement.textContent?.trim() || '';
        
        // 清理文本
        text = text.replace(/\s+/g, ' ').trim();
        
        return text;
    }


    isUserMessage(messageElement) {
        // 多种方式判断用户消息
        const text = messageElement.textContent || '';
        const classes = String(messageElement.className || '');
        
        // 1. 检查特定的类名或属性
        if (classes.includes('user') || 
            messageElement.querySelector('[class*="user"]') ||
            messageElement.hasAttribute('data-user')) {
            return true;
        }
        
        // 2. 检查样式特征
        const computedStyle = window.getComputedStyle(messageElement);
        const textAlign = computedStyle.textAlign;
        const marginLeft = parseInt(computedStyle.marginLeft) || 0;
        
        if (textAlign === 'right' || marginLeft > 50) {
            return true;
        }
        
        // 3. 检查内容特征（用户消息通常较短且是问题）
        const isQuestion = text.includes('?') || text.includes('？') || 
                          text.includes('如何') || text.includes('怎么') ||
                          text.includes('什么') || text.includes('为什么');
        
        const isShort = text.length < 200;
        
        return isQuestion && isShort;
    }
    
    isAssistantMessage(messageElement) {
        // 多种方式判断AI消息
        const text = messageElement.textContent || '';
        const classes = String(messageElement.className || '');
        
        // 1. 检查特定的类名或属性
        if (classes.includes('assistant') || classes.includes('bot') || 
            classes.includes('claude') ||
            messageElement.querySelector('[class*="assistant"]') ||
            messageElement.querySelector('[class*="bot"]')) {
            return true;
        }
        
        // 2. 检查内容特征（AI回答通常较长且有结构）
        const hasStructure = text.includes('1.') || text.includes('2.') ||
                            text.includes('首先') || text.includes('其次') ||
                            text.includes('总结') || text.includes('建议');
        
        const isLong = text.length > 100;
        
        return hasStructure || isLong;
    }

    // 判断文本是否为对话标题而非实际内容
    isConversationTitle(text) {
        if (!text || typeof text !== 'string') return false;
        
        const trimmedText = text.trim();
        
        // 检查是否为简短的标题（通常少于50个字符且不包含标点符号）
        if (trimmedText.length < 50 && !trimmedText.includes('.') && !trimmedText.includes('?') && !trimmedText.includes('！') && !trimmedText.includes('？')) {
            return true;
        }
        
        // 检查是否包含常见的标题模式
        const titlePatterns = [
            /^[A-Za-z\s]+$/, // 纯英文单词
            /^[\u4e00-\u9fff\s]+$/, // 纯中文
            /^[A-Za-z\s\-_']+$/,  // 英文标题格式
            /^.{1,30}$/  // 非常短的文本
        ];
        
        // 如果文本很短且匹配标题模式，可能是标题
        if (trimmedText.length < 30 && titlePatterns.some(pattern => pattern.test(trimmedText))) {
            // 进一步检查：是否缺少句子结构
            const hasSentenceStructure = trimmedText.includes(' ') && 
                                       (trimmedText.includes('.') || trimmedText.includes('?') || 
                                        trimmedText.includes('！') || trimmedText.includes('？') ||
                                        trimmedText.includes('，') || trimmedText.includes(','));
            
            return !hasSentenceStructure;
        }
        
        return false;
    }

    // 调试页面结构
    debugPageStructure() {
        console.group('🔍 详细页面结构分析');
        
        // 检查body的直接子元素
        console.log('📋 Body直接子元素:');
        Array.from(document.body.children).forEach((child, index) => {
            console.log(`  ${index}: <${child.tagName.toLowerCase()}> class="${child.className}" id="${child.id}"`);
        });
        
        // 检查是否有React根节点
        const reactRoots = document.querySelectorAll('#root, #app, [data-reactroot]');
        console.log(`📱 React根节点数量: ${reactRoots.length}`);
        if (reactRoots.length > 0) {
            reactRoots.forEach((root, index) => {
                console.log(`  根节点${index}: <${root.tagName.toLowerCase()}> class="${root.className}" 子元素数量: ${root.children.length}`);
            });
        }
        
        // 查找任何包含文本的div
        const textDivs = Array.from(document.querySelectorAll('div')).filter(div => {
            const text = div.textContent?.trim();
            return text && text.length > 20 && text.length < 500 && 
                   !div.querySelector('div') && // 没有子div
                   !text.includes('data-testid'); // 不是DOM属性文本
        });
        
        console.log(`📝 可能的消息div数量: ${textDivs.length}`);
        if (textDivs.length > 0) {
            textDivs.slice(0, 5).forEach((div, index) => {
                console.log(`  消息候选${index}: "${div.textContent.substring(0, 50)}..." class="${div.className}"`);
            });
        }
        
        // 检查特定的Claude元素
        const claudeElements = document.querySelectorAll('[class*="claude"], [class*="anthropic"], [class*="conversation"], [class*="chat"]');
        console.log(`🤖 Claude相关元素数量: ${claudeElements.length}`);
        
        // 检查input或textarea
        const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
        console.log(`⌨️ 输入框数量: ${inputs.length}`);
        
        console.groupEnd();
    }

    // Claude特有的导航功能
    navigateToMessage(messageId) {
        console.log(`🔍 导航到消息ID: ${messageId}`);
        
        // 调试：检查所有带有data-mindmap-id的元素
        const allMindmapElements = document.querySelectorAll('[data-mindmap-id]');
        console.log(`📋 找到 ${allMindmapElements.length} 个带有data-mindmap-id的元素:`, 
            Array.from(allMindmapElements).map(el => el.getAttribute('data-mindmap-id')));
        
        const messageElement = document.querySelector(`[data-mindmap-id="${messageId}"]`);
        console.log(`🎯 查找 [data-mindmap-id="${messageId}"] 结果:`, messageElement);
        
        if (messageElement) {
            messageElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
            
            // 高亮消息
            this.highlightMessage(messageElement);
            
            return true;
        }
        
        console.warn(`❌ 未找到消息: ${messageId}`);
        return false;
    }

    highlightMessage(messageElement) {
        // 移除之前的高亮
        document.querySelectorAll('.mindmap-highlighted').forEach(el => {
            el.classList.remove('mindmap-highlighted');
        });
        
        // 添加高亮样式
        messageElement.classList.add('mindmap-highlighted');
        
        // 添加临时高亮样式 - 统一黄色高亮，只高亮文字
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

    // Claude特有的URL处理
    getCurrentUrl() {
        // Claude的URL通常包含chat ID
        const pathname = window.location.pathname;
        const chatId = pathname.split('/').pop();
        
        if (chatId && chatId !== 'chat') {
            return `claude_${chatId}`;
        }
        
        return `claude_${window.location.hostname}${pathname}`;
    }

    // Claude使用基类的默认AI分析方法
    // 如果需要Claude特有的处理，可以在这里覆盖

    // 监听Claude特有的页面事件
    bindEvents() {
        super.bindEvents();
        
        // 监听Claude的发送消息事件
        this.observeNewMessages();
        
        // 监听Claude的主题变化
        this.observeUrlChanges();
    }

    observeNewMessages() {
        // 监听新消息的添加
        const container = document.querySelector(this.getDialogueContainer());
        if (!container) return;

        const observer = new MutationObserver((mutations) => {
            let hasNewMessage = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE && 
                            node.matches && 
                            node.matches(this.getMessageSelector())) {
                            hasNewMessage = true;
                        }
                    });
                }
            });
            
            if (hasNewMessage) {
                console.log('🔄 检测到新消息');
                this.handleNewMessage();
            }
        });

        observer.observe(container, {
            childList: true,
            subtree: true
        });
    }

    async handleNewMessage() {
        // 延迟一下，等消息完全加载
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const newDialogue = this.extractDialogue();
        if (this.hasDialogueChanged(newDialogue)) {
            this.dialogue = newDialogue;
            // 可以选择重新分析或只更新缓存
            console.log('📝 更新对话内容');
        }
    }

    observeUrlChanges() {
        let currentUrl = window.location.href;
        
        const checkUrlChange = () => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                console.log('🔄 URL变化，重新初始化');
                
                // 清除当前数据
                this.dialogue = [];
                this.topics = [];
                
                // 重新开始分析
                setTimeout(() => {
                    this.startAnalysis();
                }, 1000);
            }
        };
        
        // 定期检查URL变化
        setInterval(checkUrlChange, 1000);
        
        // 监听浏览器前进后退
        window.addEventListener('popstate', checkUrlChange);
    }
}

// 注意：不再自动初始化，由content.js统一管理