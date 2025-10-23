// =================================================================================================
// SHARED SIDEBAR - 通用侧边栏逻辑，适用于所有AI平台
// =================================================================================================

export class MindmapSidebar {
    constructor(contentScript) {
        this.contentScript = contentScript;
        this.topics = [];
        this.dialogue = [];
        this.currentTopicId = null;
        this.currentMessageIndex = -1;
        this.elements = {};
        this.allExpanded = true; // 默认展开所有主题
        this.topicExpandedState = {}; // 记录每个主题的展开状态
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        
        // 尝试加载缓存数据或开始分析
        this.initializeContent();
    }

    // 重置侧边栏状态（用于URL变化时）
    resetState() {
        this.topics = [];
        this.dialogue = [];
        this.currentTopicId = null;
        this.currentMessageIndex = -1;
        this.topicExpandedState = {};
        this.allExpanded = true; // 重置为默认展开状态
        
        // 清空显示
        if (this.elements.topicsList) {
            this.elements.topicsList.innerHTML = '';
        }
        
        // 隐藏空状态和加载状态
        this.hideEmptyState();
        this.hideLoadingState();
        
        console.log('🔄 侧边栏状态已重置');
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
        
        // 刷新按钮
        const refreshBtn = document.getElementById('mindmap-refreshBtn');
        if (refreshBtn) {
            console.log('✅ 刷新按钮绑定成功');
            refreshBtn.addEventListener('click', () => {
                console.log('🔄 用户点击刷新按钮');
                this.refreshAnalysis();
            });
        }
        
        // 展开/收起按钮
        const expandBtn = document.getElementById('mindmap-styleBtn');
        if (expandBtn) {
            console.log('✅ 展开/收起按钮绑定成功');
            expandBtn.addEventListener('click', () => {
                console.log('📖 用户点击展开/收起按钮');
                this.toggleAllTopics();
            });
        }
    }

    async initializeContent() {
        console.log('🚀 初始化侧边栏内容...');
        
        // 先尝试从缓存加载
        const cachedData = await this.contentScript.loadFromStorage();
        
        // 先检查当前页面的对话数据
        const currentDialogue = this.contentScript.extractDialogue();
        console.log(`📝 当前页面对话数据: ${currentDialogue.length} 条`);
        
        if (cachedData && cachedData.topics && cachedData.topics.length > 0) {
            console.log('📂 发现缓存数据', {
                topicsCount: cachedData.topics.length,
                hasDialogue: !!cachedData.dialogue,
                dialogueLength: cachedData.dialogue?.length || 0,
                firstTopicStructure: cachedData.topics[0]
            });
            
            // 比较缓存的对话数量和当前对话数量
            const cachedDialogueLength = cachedData.dialogue?.length || 0;
            console.log(`📊 缓存对话数量: ${cachedDialogueLength}, 当前对话数量: ${currentDialogue.length}`);
            
            // 如果对话数量发生变化，重新分析
            if (cachedDialogueLength !== currentDialogue.length) {
                console.log('🔄 对话内容已更新，重新分析');
                this.contentScript.startAnalysis();
            } else {
                console.log('📂 使用缓存数据（对话未变化）');
                // 确保对话数据可用于消息恢复 - 优先使用缓存的对话数据
                this.contentScript.dialogue = cachedData.dialogue || currentDialogue;
                console.log(`🔧 设置对话数据用于恢复: ${this.contentScript.dialogue?.length || 0} 条`);
                
                // 如果缓存中没有对话数据，重新提取
                if (!this.contentScript.dialogue || this.contentScript.dialogue.length === 0) {
                    console.log('🔄 缓存中无对话数据，重新提取');
                    this.contentScript.dialogue = currentDialogue;
                }
                
                this.updateTopics(cachedData.topics);
            }
        } else {
            console.log('🔍 没有缓存数据，开始新的分析');
            
            if (currentDialogue.length === 0) {
                console.log('⚠️ 当前页面没有对话，显示空状态');
                this.showEmptyState();
            } else {
                console.log('✅ 发现对话数据，开始分析');
                this.contentScript.startAnalysis();
            }
        }
    }

    async refreshAnalysis() {
        console.log('🔄 刷新分析...');
        
        // 清除缓存
        await this.clearCache();
        
        // 清除当前数据
        this.topics = [];
        this.dialogue = [];
        this.currentTopicId = null;
        this.currentMessageIndex = -1;
        
        // 显示加载状态
        this.showLoadingState();
        
        // 重新开始分析
        await this.contentScript.startAnalysis();
    }

    async clearCache() {
        const currentUrl = this.contentScript.getCurrentUrl();
        try {
            await chrome.storage.local.remove([`mindmap_${currentUrl}`]);
            console.log('🗑️ 缓存已清除');
        } catch (error) {
            console.error('❌ 清除缓存失败:', error);
        }
    }

    updateTopics(topics, analysisData = null) {
        const validTopics = Array.isArray(topics) ? topics.filter(Boolean) : [];
        
        if (validTopics.length === 0) {
            this.showEmptyState();
            return;
        }

        // 检查是否是降级模式，如果是，稍后显示通知
        const isFallbackMode = analysisData && analysisData._fallback;
        
        // 处理消息数据，确保格式正确
        this.topics = validTopics.map(topic => {
            console.log(`🔧 处理主题 ${topic.id}:`, {
                hasMessages: !!topic.messages,
                messagesLength: topic.messages?.length || 0,
                hasMessageIndexes: !!topic.messageIndexes,
                messageIndexesLength: topic.messageIndexes?.length || 0,
                hasDialogue: !!this.contentScript.dialogue,
                dialogueLength: this.contentScript.dialogue?.length || 0
            });
            
            // 检查消息恢复需求
            if (!topic.messages || (Array.isArray(topic.messages) && topic.messages.length === 0)) {
                if (topic.messageIndexes && this.contentScript.dialogue) {
                    console.log(`🔄 从索引恢复消息: messageIndexes=`, topic.messageIndexes);
                    topic.messages = this.generateMessagesFromIndexes(topic.messageIndexes, this.contentScript.dialogue);
                    console.log(`✅ 恢复了 ${topic.messages?.length || 0} 条消息`);
                } else {
                    console.warn(`⚠️ 主题 ${topic.id} 没有消息数据也没有消息索引`);
                }
            } else {
                console.log(`📝 主题 ${topic.id} 已有 ${topic.messages.length} 条消息，无需恢复`);
            }
            
            // 确保每个消息都有正确的字段
            if (topic.messages) {
                topic.messages = topic.messages.map((msg, msgIndex) => {
                    console.log(`🔍 处理消息字段: msgIndex=${msgIndex}, msg=`, msg);
                    const messageObj = {
                        id: msg.id !== undefined ? msg.id : (msg.index !== undefined ? msg.index : msgIndex),
                        text: msg.text || msg.content || '',
                        type: msg.type || msg.role || 'user'
                    };
                    console.log(`✅ 处理后的消息:`, messageObj);
                    return messageObj;
                });
            }
            
            return topic;
        });
        
        this.hideLoadingState();
        this.hideEmptyState();
        
        // 渲染主题列表
        this.renderTopics();
        
        // 如果是降级模式，显示通知
        if (isFallbackMode) {
            setTimeout(() => {
                const fallbackReason = analysisData._fallback_reason || '已切换到问题导航模式';
                let fallbackDetail = analysisData._fallback_detail || '';
                
                console.log('🔔 显示降级通知:', {
                    reason: fallbackReason,
                    detail: fallbackDetail,
                    originalAnalysisData: analysisData
                });
                
                // 根据不同的失败原因提供有用的详情
                if (fallbackDetail.includes('当前对话数量：')) {
                    // 对话数量不足 - 保持原有的详情
                } else if (fallbackDetail.includes('Failed to fetch')) {
                    // 网络连接失败 - 提供诊断建议
                    fallbackDetail = '无法连接到AI服务。请检查：\n1. API服务地址是否正确\n2. 网络连接是否正常\n3. API服务是否正在运行';
                } else if (fallbackDetail.includes('API key') || fallbackDetail.includes('api_key') || fallbackDetail.includes('401') || fallbackDetail.includes('unauthorized')) {
                    // API密钥问题 - 提供解决建议
                    fallbackDetail = 'API密钥验证失败。请检查：\n1. API密钥是否正确\n2. 密钥是否有效\n3. 是否有足够的配额';
                } else if (fallbackDetail.includes('rate limit') || fallbackDetail.includes('quota')) {
                    // 配额限制 - 提供解决建议
                    fallbackDetail = 'API调用次数已达限制。请：\n1. 等待配额重置\n2. 检查付费计划\n3. 稍后重试';
                } else if (fallbackDetail === '使用问题导航模式代替AI主题分析' || 
                          fallbackDetail === 'AI分析服务暂时不可用，已切换到问题导航模式') {
                    // 提供更有用的提示信息
                    fallbackDetail = '💡 小提示：通常是网络问题或API配置问题\n• 检查网络连接是否正常\n• 检查设置中的API配置\n• 稍后重试';
                } else if (fallbackDetail.trim().length > 0) {
                    // 如果有其他错误信息，保持原样显示
                    // 不做任何处理，保留原始错误信息
                }
                
                console.log('🔔 处理后的通知内容:', {
                    reason: fallbackReason,
                    detail: fallbackDetail
                });
                
                this.showFailureNotification(fallbackReason, fallbackDetail);
            }, 100);
        }
        
        console.log(`✅ 更新了 ${validTopics.length} 个主题${isFallbackMode ? '（降级模式）' : ''}`);
    }

    renderTopics() {
        if (!this.elements.topicsList) return;

        const isFigmaMode = this.contentScript.currentStyle === 'figma';
        let html = '';

        this.topics.forEach((topic, index) => {
            if (isFigmaMode) {
                html += this.renderFigmaTopicCard(topic, index);
            } else {
                html += this.renderDefaultTopicCard(topic, index);
            }
        });

        this.elements.topicsList.innerHTML = html;
        this.bindTopicEvents();
    }

    renderFigmaTopicCard(topic, index) {
        const topicType = this.getTopicType(topic, index);
        const isExpanded = this.allExpanded; // 使用全局展开状态
        
        // Figma模式：主题框和用户问题框分离
        const isQuestionNavigator = topic.isQuestionNavigator;
        let html = `
            <div class="topic-node" data-topic-type="${topicType}" data-topic-id="${topic.id}" ${isQuestionNavigator ? 'data-is-question-navigator="true"' : ''}>
                <div class="topic-header">
                    <div class="topic-title">
                        <span class="topic-icon">${this.getTopicIcon(topicType, topic.isQuestionNavigator)}</span>
                        ${this.escapeHtml(topic.topic || topic.title || '未命名主题')}
                    </div>
                </div>
                ${topic.summary ? `<div class="topic-summary">${this.escapeHtml(topic.summary)}</div>` : ''}
            </div>
        `;
        
        // 分离的用户问题框
        if (topic.messages && topic.messages.length > 0) {
            topic.messages.forEach((message, msgIndex) => {
                const isLastMessage = msgIndex === topic.messages.length - 1;
                const wrapperClass = isLastMessage ? 'message-wrapper last-message' : 'message-wrapper';
                
                html += `
                    <div class="${wrapperClass}" data-topic-type="${topicType}">
                        <div class="message-prefix" data-topic-type="${topicType}"></div>
                        <div class="message-card ${message.id === this.currentMessageIndex ? 'current' : ''}" 
                             data-message-id="${message.id}" 
                             data-topic-id="${topic.id}">
                            <div class="message-icon">${this.getMessageIcon(message.type)}</div>
                            <div class="message-text">${this.escapeHtml(message.text)}</div>
                        </div>
                    </div>
                `;
            });
        }
        
        return html;
    }

    renderDefaultTopicCard(topic, index) {
        const topicType = this.getTopicType(topic, index);
        // 检查该主题的展开状态：如果没有设置过，使用全局状态
        const isExpanded = this.topicExpandedState.hasOwnProperty(topic.id) 
            ? this.topicExpandedState[topic.id] 
            : this.allExpanded;
        
        console.log(`🎯 渲染话题 ${topic.id}: allExpanded=${this.allExpanded}, isExpanded=${isExpanded}, messages=${topic.messages?.length || 0}, isQuestionNavigator=${topic.isQuestionNavigator}`);
        
        // 检查是否是问题导航模式
        const isQuestionNavigator = topic.isQuestionNavigator;
        
        // 默认模式：嵌套结构
        let html = `
            <div class="topic-node" data-topic-type="${topicType}" data-topic-id="${topic.id}" ${isQuestionNavigator ? 'data-is-question-navigator="true"' : ''}>
                <div class="topic-header">
                    <div class="topic-title">
                        <span class="topic-icon">${this.getTopicIcon(topicType, topic.isQuestionNavigator)}</span>
                        ${this.escapeHtml(topic.topic || topic.title || '未命名主题')}
                    </div>
                    ${!isQuestionNavigator ? `
                    <div class="topic-meta">
                        <button class="topic-toggle ${isExpanded ? 'expanded' : ''}" data-topic-id="${topic.id}">
                            ${isExpanded ? '▼' : '◀'}
                        </button>
                    </div>
                    ` : ''}
                </div>
                ${topic.summary ? `<div class="topic-summary">${this.escapeHtml(topic.summary)}</div>` : ''}
                
                ${!isQuestionNavigator ? `
                <div class="messages-list ${isExpanded ? 'expanded' : ''}" id="messages-${topic.id}">
                    ${this.renderMessagesList(topic, isExpanded)}
                </div>
                ` : ''}
            </div>
        `;
        
        return html;
    }

    renderMessagesList(topic, isExpanded) {
        console.log(`📋 renderMessagesList: topic.id=${topic.id}, messages=${topic.messages?.length || 0}, isExpanded=${isExpanded}`);
        
        if (!topic.messages || !isExpanded) {
            console.log(`❌ 消息列表不显示: messages=${!!topic.messages}, isExpanded=${isExpanded}`);
            return '';
        }
        
        const messageCount = topic.messages ? topic.messages.length : 0;
        console.log(`✅ 渲染 ${messageCount} 条消息`);
        let html = `<div class="messages-header">相关问题（${messageCount}条）</div>`;
        
        topic.messages.forEach(message => {
            console.log(`📝 渲染消息: topic.id=${topic.id}, message.id=${message.id}, type=${typeof message.id}`);
            
            const isCurrentMessage = message.id === this.currentMessageIndex;
            html += `
                <div class="message-item ${isCurrentMessage ? 'current' : ''}" 
                     data-message-id="${message.id}" 
                     data-topic-id="${topic.id}">
                    <div class="message-icon">${this.getMessageIcon(message.type)}</div>
                    <div class="message-text">${this.escapeHtml(message.text)}</div>
                </div>
            `;
        });
        
        return html;
    }

    getTopicType(topic, index) {
        // 如果是问题导航模式，根据索引循环分配类型
        if (topic.isQuestionNavigator) {
            const types = ['concept', 'technical', 'analysis', 'reference', 'discussion', 'creative'];
            return types[index % types.length];
        }
        
        if (topic.type && topic.type !== 'question') return topic.type;
        
        // 根据索引循环分配类型
        const types = ['concept', 'technical', 'analysis', 'reference', 'discussion', 'creative'];
        return types[index % types.length];
    }

    getTopicIcon(type, isQuestionNavigator = false) {
        // 问题导航模式统一使用book图标
        if (isQuestionNavigator) {
            return `<img src="${chrome.runtime.getURL('icons/ph-book.svg')}" alt="问题" style="width: 16px; height: 16px;">`;
        }
        
        const icons = {
            concept: `<img src="${chrome.runtime.getURL('icons/ph-lightbulb.svg')}" alt="概念" style="width: 16px; height: 16px;">`,
            technical: `<img src="${chrome.runtime.getURL('icons/ph-gear.svg')}" alt="技术" style="width: 16px; height: 16px;">`,
            analysis: `<img src="${chrome.runtime.getURL('icons/ph-chart-line.svg')}" alt="分析" style="width: 16px; height: 16px;">`,
            reference: `<img src="${chrome.runtime.getURL('icons/ph-book.svg')}" alt="参考" style="width: 16px; height: 16px;">`,
            discussion: `<img src="${chrome.runtime.getURL('icons/ph-chats.svg')}" alt="讨论" style="width: 16px; height: 16px;">`,
            creative: `<img src="${chrome.runtime.getURL('icons/ph-palette.svg')}" alt="创意" style="width: 16px; height: 16px;">`
        };
        return icons[type] || `<img src="${chrome.runtime.getURL('icons/ph-book.svg')}" alt="主题" style="width: 16px; height: 16px;">`;
    }

    getMessageIcon(type) {
        const icons = {
            user: `<img src="${chrome.runtime.getURL('icons/ph-user.svg')}" alt="用户" style="width: 12px; height: 12px;">`,
            assistant: `<img src="${chrome.runtime.getURL('icons/ph-chats.svg')}" alt="助手" style="width: 12px; height: 12px;">`,
            system: `<img src="${chrome.runtime.getURL('icons/ph-gear.svg')}" alt="系统" style="width: 12px; height: 12px;">`
        };
        return icons[type] || `<img src="${chrome.runtime.getURL('icons/ph-chats.svg')}" alt="消息" style="width: 12px; height: 12px;">`;
    }

    bindTopicEvents() {
        // 绑定主题展开/收起事件
        document.querySelectorAll('.topic-toggle').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const topicId = parseInt(button.dataset.topicId);
                this.toggleTopic(topicId);
            });
        });

        // 绑定消息点击事件
        document.querySelectorAll('.message-item, .message-card').forEach(item => {
            item.addEventListener('click', () => {
                console.log(`🔍 点击消息元素:`, {
                    messageIdRaw: item.dataset.messageId,
                    topicIdRaw: item.dataset.topicId,
                    element: item
                });
                
                const messageId = parseInt(item.dataset.messageId);
                const topicId = parseInt(item.dataset.topicId);
                
                console.log(`🔍 解析后的ID:`, {
                    messageId,
                    topicId,
                    messageIdValid: !isNaN(messageId),
                    topicIdValid: !isNaN(topicId)
                });
                
                if (isNaN(messageId)) {
                    console.error(`❌ 消息ID解析失败: ${item.dataset.messageId}`);
                    return;
                }
                
                this.navigateToMessage(messageId, topicId);
            });
        });

        // 绑定主题标题点击事件
        document.querySelectorAll('.topic-title').forEach(title => {
            title.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止事件冒泡
                const topicNode = title.closest('.topic-node');
                if (topicNode) {
                    const topicId = parseInt(topicNode.dataset.topicId);
                    
                    // 检查是否是问题导航模式
                    const topic = this.topics.find(t => t.id === topicId || t.id === `q${topicId}` || t.id === topicNode.dataset.topicId);
                    
                    if (topic && topic.isQuestionNavigator) {
                        // 问题导航模式：直接导航到消息
                        if (topic.messages && topic.messages.length > 0) {
                            const messageId = topic.messages[0].id;
                            console.log(`🔍 问题导航模式 - 导航到消息: ${messageId}`);
                            this.navigateToMessage(messageId, topicId);
                        }
                    } else {
                        // 普通模式：切换展开/收起
                        this.toggleTopic(topicId);
                    }
                }
            });
        });
    }

    toggleTopic(topicId) {
        // 切换该主题的展开状态
        const currentState = this.topicExpandedState.hasOwnProperty(topicId) 
            ? this.topicExpandedState[topicId] 
            : this.allExpanded;
        
        this.topicExpandedState[topicId] = !currentState;
        
        console.log(`🔄 切换主题 ${topicId} 状态: ${currentState} -> ${!currentState}`);
        
        this.renderTopics();
    }

    toggleAllTopics() {
        this.allExpanded = !this.allExpanded;
        console.log(`📖 切换所有主题为: ${this.allExpanded ? '展开' : '收起'}`);
        
        // 清除所有独立主题状态，使用全局状态
        this.topicExpandedState = {};
        
        // 更新按钮图标
        const expandBtn = document.getElementById('mindmap-styleBtn');
        if (expandBtn) {
            const icon = expandBtn.querySelector('img');
            if (icon) {
                // 根据状态切换图标
                const iconPath = this.allExpanded ? 'icons/ph-close.svg' : 'icons/ph-open.svg';
                icon.src = chrome.runtime.getURL(iconPath);
                expandBtn.title = this.allExpanded ? '收起所有' : '展开所有';
            }
        }
        
        this.renderTopics();
    }

    // 显示失败通知（在主题列表上方，不影响现有内容）
    showFailureNotification(userMessage, technicalError) {
        this.hideLoadingState();
        
        if (this.elements.topicsList) {
            // 检查是否需要显示技术详情（只在有真正有用的技术信息时显示）
            const hasUsefulTechnicalInfo = technicalError && 
                technicalError.trim().length > 0;
            
            // 在主题列表前添加通知
            const notification = `
                <div class="failure-notification" id="ai-failure-notification">
                    <div class="failure-header">
                        <span class="failure-icon">⚠️</span>
                        <span class="failure-title">AI分析失败</span>
                    </div>
                    <div class="failure-reason">${this.escapeHtml(userMessage)}</div>
                    ${hasUsefulTechnicalInfo ? `
                    <div class="failure-technical-direct">${this.escapeHtml(technicalError)}</div>
                    ` : ''}
                    <button class="retry-btn" data-action="close-notification">
                        <span class="retry-icon">✕</span>
                        关闭提示
                    </button>
                </div>
            `;
            
            // 移除之前的通知
            const existing = document.getElementById('ai-failure-notification');
            if (existing) {
                existing.remove();
            }
            
            // 在列表开头插入通知
            this.elements.topicsList.insertAdjacentHTML('afterbegin', notification);
            
            // 绑定关闭按钮事件
            const closeBtn = document.querySelector('[data-action="close-notification"]');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    const notification = document.getElementById('ai-failure-notification');
                    if (notification) {
                        notification.remove();
                    }
                });
            }
        }
    }

    navigateToMessage(messageId, topicId) {
        console.log(`🔗 导航到消息: ${messageId}, 主题: ${topicId}`);
        
        // 更新当前选中状态
        this.currentMessageIndex = messageId;
        this.currentTopicId = topicId;
        
        // 重新渲染以更新选中状态
        this.renderTopics();
        
        // 调用适配器的导航方法
        const success = this.contentScript.navigateToMessage?.(messageId);
        
        if (!success) {
            console.warn(`❌ 导航失败: 未找到消息 ${messageId}`);
            this.showNotification('导航失败：未找到对应消息', 'error');
        }
    }

    showLoadingState() {
        if (this.elements.loadingState) {
            this.elements.loadingState.style.display = 'flex';
        }
        if (this.elements.emptyState) {
            this.elements.emptyState.style.display = 'none';
        }
        if (this.elements.topicsList) {
            this.elements.topicsList.style.display = 'none';
        }
    }

    hideLoadingState() {
        if (this.elements.loadingState) {
            this.elements.loadingState.style.display = 'none';
        }
        if (this.elements.topicsList) {
            this.elements.topicsList.style.display = 'block';
        }
    }

    showEmptyState() {
        if (this.elements.emptyState) {
            this.elements.emptyState.style.display = 'flex';
        }
        if (this.elements.loadingState) {
            this.elements.loadingState.style.display = 'none';
        }
        if (this.elements.topicsList) {
            this.elements.topicsList.style.display = 'none';
        }
    }

    hideEmptyState() {
        if (this.elements.emptyState) {
            this.elements.emptyState.style.display = 'none';
        }
    }

    showErrorState(message) {
        const errorHtml = `
            <div class="failure-notification">
                <div class="failure-header">
                    <span class="failure-icon">⚠️</span>
                    <span class="failure-title">分析失败</span>
                </div>
                <div class="failure-reason">${this.escapeHtml(message)}</div>
                <button class="retry-btn" onclick="this.parentElement.remove(); mindmapSidebar.refreshAnalysis();">
                    <span class="retry-icon">🔄</span>
                    重试
                </button>
            </div>
        `;
        
        if (this.elements.topicsList) {
            this.elements.topicsList.innerHTML = errorHtml;
            this.elements.topicsList.style.display = 'block';
        }
        
        this.hideLoadingState();
        this.hideEmptyState();
    }

    showNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `mindmap-notification mindmap-notification-${type}`;
        notification.textContent = message;
        
        // 添加样式
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#fee2e2' : '#dbeafe'};
            color: ${type === 'error' ? '#dc2626' : '#1e40af'};
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000000;
            font-size: 14px;
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        document.body.appendChild(notification);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    updateProgress(text, percentage) {
        if (this.elements.progressText) {
            this.elements.progressText.textContent = text;
        }
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${percentage}%`;
        }
    }

    generateMessagesFromIndexes(messageIndexes, dialogue) {
        if (!Array.isArray(messageIndexes) || !Array.isArray(dialogue)) {
            console.warn('generateMessagesFromIndexes: 无效的参数', { messageIndexes, dialogue: dialogue?.length });
            return [];
        }
        
        
        const messages = messageIndexes
            .map(index => {
                if (typeof index !== 'number' || index < 0 || index >= dialogue.length) {
                    return null;
                }
                
                const dialogueItem = dialogue[index];
                if (!dialogueItem) {
                    return null;
                }
                
                // 返回所有相关消息，但标记类型
                return {
                    id: index,
                    text: dialogueItem.content,
                    type: dialogueItem.role === 'user' ? 'user' : 'assistant'
                };
            })
            .filter(Boolean);
            
        console.log(`📋 生成了 ${messages.length} 条消息`);
        return messages;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 全局暴露以便其他脚本调用
if (typeof window !== 'undefined') {
    window.MindmapSidebar = MindmapSidebar;
}