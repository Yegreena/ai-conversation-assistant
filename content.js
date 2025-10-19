// =================================================================================================
// ADDON V3 - UNIFIED CONTENT SCRIPT (Corrected)
// This script is a result of refactoring to a non-iframe architecture.
// It merges the logic of content.js, sidebar.js, and sidebar.html into one file.
// =================================================================================================

// SECTION 1: STYLES ARE NOW INJECTED VIA manifest.json. This section is intentionally blank.

// =================================================================================================
// SECTION 2: MERGED HTML (from sidebar.html)
// =================================================================================================
const sidebarHTML = `
    <div class="sidebar-container">
        <div class="sidebar-header">
            <div class="header-title">
                <span class="topic-icon">💬</span>
                AI对话主题助手
            </div>
            <button class="close-btn" id="mindmap-closeBtn" title="关闭">✕</button>
        </div>
        <div class="topics-container" id="mindmap-topicsContainer">
            <div class="loading-state" id="mindmap-loadingState">
                <div class="progress-container">
                    <div class="progress-text" id="mindmap-progressText">准备中...</div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="mindmap-progressFill"></div>
                    </div>
                </div>
            </div>
            <div class="empty-state" id="mindmap-emptyState" style="display: none;">
                <div class="empty-icon">💭</div>
                <div class="empty-text">暂无对话主题</div>
                <div class="empty-subtext">开始对话后，侧边栏将自动分析并生成主题列表</div>
            </div>
            <div class="topics-timeline" id="mindmap-topicsList"></div>
        </div>
    </div>
`;

// =================================================================================================
// SECTION 3: MERGED UI LOGIC (from sidebar.js)
// =================================================================================================
class MindmapSidebar {
    constructor(contentScript) {
        this.contentScript = contentScript;
        this.topics = [];
        this.dialogue = [];
        this.currentTopicId = null;
        this.currentMessageIndex = -1;
        this.elements = {};
    }

    init() {
        this.cacheElements();
        this.bindEvents();
    }

    cacheElements() {
        const ids = ['closeBtn', 'topicsContainer', 'topicsList', 'loadingState', 'emptyState', 'progressText', 'progressFill'];
        ids.forEach(id => {
            this.elements[id] = document.getElementById(`mindmap-${id}`);
        });
    }

    bindEvents() {
        if (this.elements.closeBtn) {
            this.elements.closeBtn.addEventListener('click', () => this.contentScript.hideSidebar());
        }
    }

    updateTopics(topics, analysisData = null) {
        const validTopics = Array.isArray(topics) ? topics.filter(Boolean) : [];
        this.topics = validTopics;
        this.analysisData = analysisData; // 保存分析结果数据
        this.requestDialogueData();
        this.hideLoading();
        this.renderTopics();
        
        // 检查是否是降级模式
        if (analysisData && analysisData._fallback) {
            const reason = analysisData._failureReason || '未知原因';
            this.updateProgress({ progress: 100, status: `AI分析失败，已切换到问题导航模式` });
        } else {
            this.updateProgress({ progress: 100, status: '分析完成！' });
        }
    }
    
    handleDialogueData(dialogue) {
        this.dialogue = dialogue;
        this.topics = this.topics.filter(Boolean);
        this.topics.forEach(topic => {
            if (topic && topic.messageIndexes && Array.isArray(topic.messageIndexes)) {
                topic.messages = this.generateMessagesList(topic.messageIndexes, dialogue);
            } else {
                topic.messages = [];
            }
        });
        this.renderTopics();
    }

    updateProgress(progressData) {
        if (!progressData || !this.elements.progressFill || !this.elements.progressText) return;
        const progress = Math.min(100, Math.max(0, progressData.progress || 0));
        this.elements.progressText.textContent = progressData.status || `${Math.round(progress)}%`;
        this.elements.progressFill.style.width = `${progress}%`;
    }

    renderTopics() {
        if (!this.elements.topicsList) return;
        if (!this.topics || this.topics.length === 0) {
            this.showEmptyState();
            return;
        }
        this.hideEmptyState();
        
        let content = '';
        
        // 检查是否是降级模式，添加失败通知
        if (this.analysisData && this.analysisData._fallback) {
            const failureReason = this.analysisData._failureReason || '未知原因';
            content += `
                <div class="failure-notification">
                    <div class="failure-header">
                        <span class="failure-icon">⚠️</span>
                        <span class="failure-title">AI分析失败，已切换到问题导航模式</span>
                    </div>
                    <div class="failure-reason">原因：${failureReason}</div>
                    ${this.analysisData._canRetry ? `
                        <button class="retry-btn" id="mindmap-retryBtn">
                            <span class="retry-icon">🔄</span>
                            重新尝试AI分析
                        </button>
                    ` : ''}
                </div>
            `;
        }
        
        const sortedTopics = this.topics.sort((a, b) => (a.order || 0) - (b.order || 0));
        content += sortedTopics.map(topic => this.renderTopicCard(topic)).join('');
        
        this.elements.topicsList.innerHTML = content;
        this.bindTopicEvents();
        this.bindRetryButton();
    }

    renderTopicCard(topic) {
        const isExpanded = topic.expanded !== false;
        const totalMessages = topic.messageIndexes?.length || 0;
        const userMessages = topic.messages?.length || 0;
        // 轮数计算暂时注释掉，因为计算逻辑需要重新设计
        // const rounds = Math.max(1, Math.ceil(totalMessages / 2));
        const topicType = this.getTopicTypeByNumber(topic.topicNumber || 1);
        
        // 问题导航模式的特殊处理（必须同时满足两个条件）
        const isQuestionNavigator = topic.isQuestionNavigator === true && topic.hideMessagesList === true;
        const extraClasses = isQuestionNavigator ? 'question-navigator' : '';
        
        console.log(`🎯 渲染主题卡片: ${topic.topic}, 总消息:${totalMessages}, 用户消息:${userMessages}, 模式:${isQuestionNavigator ? '问题导航' : '普通'}`);

        return `
            <div class="topic-node ${topic.id === this.currentTopicId ? 'active' : ''} ${extraClasses}" data-topic-id="${topic.id}" data-topic-type="${topicType}">
                <div class="topic-header">
                    <div class="topic-title">
                        <span class="topic-icon">${this.getTopicIcon(topic)}</span>
                        ${topic.topic || '未命名主题'}
                    </div>
                    ${/* 暂时隐藏轮数显示 */ ''}
                </div>
                <div class="topic-content">
                    <div class="topic-summary">${topic.summary || ''}</div>
                    ${this.renderMessagesList(topic, isExpanded)}
                </div>
            </div>
        `;
    }

    renderMessagesList(topic, isExpanded) {
        // 只有明确的问题导航模式才隐藏用户问题列表
        if (topic.isQuestionNavigator === true && topic.hideMessagesList === true) {
            return '';
        }
        
        if (!topic.messages || topic.messages.length === 0) {
            console.log(`📝 主题 ${topic.topic} 没有用户消息，原因: messages=${topic.messages?.length}, messageIndexes=${topic.messageIndexes?.length}`);
            return '';
        }
        const messagesHtml = topic.messages.map(message => {
            if (!message) return '';
            return `
                <div class="message-item ${message.index === this.currentMessageIndex ? 'current' : ''}" data-message-index="${message.index}">
                    <span class="message-icon">👤</span>
                    <span class="message-text">${this.truncateText(message.content || '', 80)}</span>
                </div>
            `;
        }).join('');

        return `<div class="messages-list ${isExpanded ? 'expanded' : ''}">${messagesHtml}</div>`;
    }

    bindTopicEvents() {
        this.elements.topicsList.querySelectorAll('.topic-node').forEach(node => {
            node.addEventListener('click', (e) => {
                if (e.target.closest('.message-item')) return;
                const topicId = node.dataset.topicId;
                const topic = this.topics.find(t => t && t.id === topicId);
                
                // 问题导航模式：直接跳转到问题，不展开
                if (topic && topic.isQuestionNavigator) {
                    console.log('🎯 问题导航模式：直接跳转到问题');
                    if (topic.messageIndexes && topic.messageIndexes.length > 0) {
                        this.scrollToMessage(topic.messageIndexes[0]); // 跳转到用户问题
                    }
                } else {
                    // 普通模式：展开/折叠
                    this.toggleTopic(topicId);
                }
            });
        });

        this.elements.topicsList.querySelectorAll('.message-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const messageIndex = parseInt(item.dataset.messageIndex, 10);
                if (!isNaN(messageIndex)) {
                    this.scrollToMessage(messageIndex);
                }
            });
        });
    }
    
    bindRetryButton() {
        const retryBtn = document.getElementById('mindmap-retryBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                console.log('🔄 用户点击重试按钮');
                this.retryAIAnalysis();
            });
        }
    }
    
    retryAIAnalysis() {
        // 重置分析数据
        this.analysisData = null;
        this.topics = [];
        
        // 显示加载状态
        this.showLoading();
        this.updateProgress({ progress: 0, status: '重新开始AI分析...' });
        
        // 重新请求主题数据
        this.contentScript.requestTopicsData();
    }

    toggleTopic(topicId) {
        const topic = this.topics.find(t => t && t.id === topicId);
        if (topic) {
            topic.expanded = !topic.expanded;
            this.renderTopics();
        }
    }
    
    scrollToMessage(messageIndex) {
        this.contentScript.scrollToMessage(messageIndex);
        this.currentMessageIndex = messageIndex;
        this.renderTopics();
    }

    highlightCurrentTopic(messageIndex) {
        if (!this.topics) return;
        const topic = this.topics.find(t => t && t.messages && t.messages.some(m => m && m.index === messageIndex));
        if (topic) {
            this.currentTopicId = topic.id;
            this.currentMessageIndex = messageIndex;
            this.renderTopics();
            const topicElement = document.querySelector(`#claude-mindmap-sidebar [data-topic-id="${topic.id}"]`);
            if (topicElement) {
                topicElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    requestTopicsData() { this.contentScript.requestTopicsData(); }
    requestDialogueData() { this.contentScript.requestDialogueData(); }
    
    getTopicIcon(topic) { return {'user': '👤', 'ai': '🤖', 'branch': '🔀'}[topic.type] || '📝'; }
    getTopicTypeByNumber(num) { return ['concept', 'technical', 'analysis', 'discussion', 'reference'][(num - 1) % 5]; }
    truncateText(text, maxLength) { return text.length > maxLength ? text.substring(0, maxLength) + '...' : text; }
    showLoading() { if(this.elements.loadingState) this.elements.loadingState.style.display = 'flex'; if(this.elements.topicsList) this.elements.topicsList.style.display = 'none'; if(this.elements.emptyState) this.elements.emptyState.style.display = 'none'; }
    hideLoading() { if(this.elements.loadingState) this.elements.loadingState.style.display = 'none'; }
    showEmptyState() { if(this.elements.emptyState) this.elements.emptyState.style.display = 'flex'; if(this.elements.topicsList) this.elements.topicsList.style.display = 'none'; }
    hideEmptyState() { if(this.elements.emptyState) this.elements.emptyState.style.display = 'none'; if(this.elements.topicsList) this.elements.topicsList.style.display = 'block'; }
    
    generateMessagesList(messageIndexes, dialogue) {
        if (!Array.isArray(messageIndexes) || !Array.isArray(dialogue)) {
            console.warn('generateMessagesList: 输入参数无效', { messageIndexes, dialogue: dialogue?.length });
            return [];
        }
        
        console.log(`📋 generateMessagesList: 处理 ${messageIndexes.length} 个索引, 对话长度 ${dialogue.length}`);
        console.log('📋 messageIndexes:', messageIndexes);
        
        const messages = messageIndexes
            .map(index => {
                if (typeof index !== 'number' || index < 0 || index >= dialogue.length) {
                    console.warn(`无效索引: ${index}, 对话长度: ${dialogue.length}`);
                    return null;
                }
                
                const item = dialogue[index];
                if (!item) {
                    console.warn(`对话项为空, 索引: ${index}`);
                    return null;
                }
                
                // 只返回用户消息
                if (item.role === 'user') {
                    console.log(`✅ 添加用户消息: 索引=${index}, 内容="${item.content.substring(0, 30)}..."`);
                    return { index, role: item.role, content: item.content };
                } else {
                    console.log(`⏭️ 跳过AI消息: 索引=${index}, 角色=${item.role}`);
                    return null;
                }
            })
            .filter(Boolean);
            
        console.log(`📋 generateMessagesList 结果: ${messages.length} 条用户消息`);
        return messages;
    }
}

// =================================================================================================
// SECTION 4: MAIN CONTENT SCRIPT LOGIC
// =================================================================================================
class UnifiedContentScript {
    constructor() {
        this.sidebarContainer = null;
        this.sidebarVisible = false;
        this.mindmap = null;
    }

    init() {
        if (document.getElementById('claude-mindmap-sidebar')) {
            console.log('[UnifiedContentScript] Sidebar already exists, skipping init');
            return;
        }
        console.log('[UnifiedContentScript] Initializing...');
        this.injectUI();
        this.mindmap = new MindmapSidebar(this);
        this.mindmap.init();
        this.setupMessageListener();
        console.log('[UnifiedContentScript] Initialization complete');
    }

    injectUI() {
        this.sidebarContainer = document.createElement('div');
        this.sidebarContainer.id = 'claude-mindmap-sidebar';
        this.sidebarContainer.innerHTML = sidebarHTML;
        document.body.appendChild(this.sidebarContainer);
        this.addResizeHandle();
    }
    
    addResizeHandle() {
        const handle = document.createElement('div');
        handle.className = 'sidebar-resize-handle';
        this.sidebarContainer.appendChild(handle);
        
        let isResizing = false;
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            let startX = e.clientX;
            let startWidth = parseInt(getComputedStyle(this.sidebarContainer).width, 10);
            
            const handleResize = (e) => {
                if (!isResizing) return;
                const newWidth = startWidth - (e.clientX - startX);
                this.sidebarContainer.style.width = Math.max(250, Math.min(500, newWidth)) + 'px';
            };
            const stopResize = () => {
                isResizing = false;
                document.removeEventListener('mousemove', handleResize);
                document.removeEventListener('mouseup', stopResize);
            };
            
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
        });
    }

    showSidebar() {
        console.log('[UnifiedContentScript] showSidebar called');
        if (!this.sidebarContainer) {
            console.error('[UnifiedContentScript] sidebarContainer not found!');
            return;
        }
        console.log('[UnifiedContentScript] Adding visible class to sidebar');
        this.sidebarContainer.classList.add('visible');
        this.sidebarVisible = true;
        console.log('[UnifiedContentScript] Sidebar visibility:', this.sidebarContainer.style.display, 'Classes:', this.sidebarContainer.className);
        this.mindmap.showLoading();
        this.mindmap.requestTopicsData();
    }

    hideSidebar() {
        if (!this.sidebarContainer) return;
        this.sidebarContainer.classList.remove('visible');
        this.sidebarVisible = false;
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "ping") {
                // Content script健康检查
                sendResponse({success: true, status: "Content script已加载"});
                return;
            }

            if (request.action === "progress_update") {
                if (this.mindmap) {
                    this.mindmap.updateProgress(request.data);
                }
                return; 
            }

            if (request.action === "OPEN_SIDEBAR") {
                this.showSidebar();
                sendResponse({success: true});
                return; 
            }
        });
    }

    requestTopicsData() {
        const dialogue = this.grabDialogue();
        if (dialogue.success && dialogue.data.dialogue.length > 0) {
            this.mindmap.updateProgress({ progress: 5, status: '开始分析...' });
            chrome.runtime.sendMessage({ action: "analyze_themes", dialogue: dialogue.data.dialogue }, (response) => {
                if (response && response.success) {
                    this.mindmap.updateTopics(response.data.nodes, response.data);
                } else {
                    console.error("Theme analysis failed:", response?.error);
                    this.mindmap.updateProgress({ progress: 100, status: '分析失败' });
                }
            });
        } else {
            this.mindmap.showEmptyState();
        }
    }
    
    requestDialogueData() {
        const dialogue = this.grabDialogue();
        if (dialogue.success) {
            this.mindmap.handleDialogueData(dialogue.data.dialogue);
        }
    }

    grabDialogue() {
        console.log('🔍 开始抓取对话内容...');
        
        // 调试：分析页面DOM结构
        console.log('🔍 页面DOM结构分析:');
        console.log('URL:', window.location.href);
        console.log('Title:', document.title);
        
        // 寻找包含对话的主容器
        const possibleContainers = [
            'main', '[role="main"]', '.conversation', '.chat', '.messages',
            '[class*="conversation"]', '[class*="chat"]', '[class*="message"]'
        ];
        
        possibleContainers.forEach(selector => {
            const container = document.querySelector(selector);
            if (container) {
                console.log(`✅ 找到容器: ${selector}`, container);
                console.log(`容器子元素数量: ${container.children.length}`);
            }
        });
        
        const SELECTORS = {
            ai_messages: [
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

        console.log('🔍 尝试用户消息选择器...');
        const userMessages = document.querySelectorAll(SELECTORS.user_messages.join(', '));
        console.log(`✅ 找到 ${userMessages.length} 条用户消息`);

        console.log('🔍 尝试AI消息选择器...');
        let aiMessages = document.querySelectorAll(SELECTORS.ai_messages.join(', '));
        console.log(`✅ 找到 ${aiMessages.length} 条AI消息`);

        // 只有在完全找不到AI消息时才使用智能检测
        if (aiMessages.length === 0) {
            console.log(`⚠️ 未找到AI消息，启用智能检测...`);
            console.log('🔍 分析页面DOM结构...');
            
            // 方法1: 查找与用户消息相邻的长文本元素
            const smartAIMessages = [];
            userMessages.forEach(userEl => {
                let nextSibling = userEl.nextElementSibling;
                let attempts = 0;
                while (nextSibling && attempts < 5) {
                    const text = nextSibling.textContent?.trim();
                    if (text && text.length > 100 && !text.includes('用户:') && 
                        !smartAIMessages.includes(nextSibling)) {
                        console.log('🤖 找到疑似AI回答 (相邻元素法):', text.substring(0, 100) + '...');
                        smartAIMessages.push(nextSibling);
                        break;
                    }
                    nextSibling = nextSibling.nextElementSibling;
                    attempts++;
                }
            });
            
            // 方法2: 基于Claude.ai最新DOM模式
            const commonPatterns = [
                'div[class*="font-claude"]',     // Claude特有字体类
                'div[class*="assistant"]',       // 包含assistant的类名
                'article',                       // 文章容器
                'div[class*="prose"]',           // prose样式容器
                'div[data-testid*="message"]',   // 消息容器
                '[class*="markdown"]',           // markdown渲染容器
                'div[class*="whitespace-pre-wrap"]' // 预格式化文本容器
            ];
            
            commonPatterns.forEach(pattern => {
                const elements = document.querySelectorAll(pattern);
                elements.forEach(el => {
                    const text = el.textContent?.trim();
                    // 更严格的过滤：避免重复元素和嵌套元素
                    if (text && text.length > 100 && text.length < 5000 && // 长度限制
                        !smartAIMessages.includes(el) && 
                        !Array.from(userMessages).includes(el) &&
                        !smartAIMessages.some(existing => existing.contains(el) || el.contains(existing)) && // 避免嵌套
                        !text.includes('data-testid') && // 避免包含DOM属性的文本
                        !text.startsWith('[') // 避免包含索引标记的文本
                    ) {
                        console.log(`🤖 找到疑似AI回答 (模式: ${pattern}):`, text.substring(0, 100) + '...');
                        smartAIMessages.push(el);
                    }
                });
            });
            
            console.log(`🔍 智能检测发现 ${smartAIMessages.length} 个疑似AI回答`);
            
            // 如果找到了疑似AI消息，创建新的NodeList
            if (smartAIMessages.length > 0) {
                aiMessages = smartAIMessages;
                console.log('✅ 使用智能检测的AI消息');
            }
        }
        
        // 去重处理：确保没有重复的元素
        const uniqueUserMessages = Array.from(new Set(userMessages));
        const uniqueAIMessages = Array.from(new Set(aiMessages));
        
        const allMessages = [
            ...uniqueUserMessages.map(el => ({ element: el, role: 'user' })), 
            ...uniqueAIMessages.map(el => ({ element: el, role: 'assistant' }))
        ];
        
        console.log(`📊 去重后消息统计: 总计${allMessages.length}条 (用户:${uniqueUserMessages.length}, AI:${uniqueAIMessages.length})`);
        
        allMessages.sort((a, b) => {
            const pos = a.element.compareDocumentPosition(b.element);
            return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        });

        const dialogue = allMessages.map((msg, index) => {
            msg.element.setAttribute('data-mindmap-id', index);
            return {
                role: msg.role,
                content: msg.element.textContent.trim(),
                index: index,
            };
        });

        return { success: true, data: { dialogue: dialogue, total: dialogue.length } };
    }

    scrollToMessage(messageIndex) {
        const targetMessage = document.querySelector(`[data-mindmap-id="${messageIndex}"]`);
        if (targetMessage) {
            targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetMessage.style.transition = 'background-color 0.2s ease-in-out';
            targetMessage.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
            setTimeout(() => {
                targetMessage.style.backgroundColor = '';
            }, 2000);
        } else {
            console.error(`Could not find message with data-mindmap-id: ${messageIndex}`);
        }
    }
}

// --- Entry Point ---
(function() {
    if (window.unifiedContentScriptLoaded) {
        return;
    }
    window.unifiedContentScriptLoaded = true;
    
    // Use a timeout to ensure the page DOM is fully settled
    setTimeout(() => {
        try {
            new UnifiedContentScript().init();
        } catch (e) {
            console.error("Failed to initialize Mindmap Extension:", e);
        }
    }, 1000);
})();