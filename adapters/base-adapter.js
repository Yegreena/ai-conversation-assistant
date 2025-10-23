// =================================================================================================
// BASE ADAPTER - 所有AI平台适配器的基础类
// =================================================================================================

export class BaseAdapter {
    constructor() {
        this.dialogue = [];
        this.topics = [];
        this.currentTopicId = null;
        this.currentMessageIndex = -1;
        this.isAnalyzing = false;
        this.sidebar = null;
        this.currentStyle = 'default'; // 'default' or 'figma'
    }

    // 抽象方法 - 子类必须实现
    getMessageSelector() {
        throw new Error('getMessageSelector must be implemented by subclass');
    }

    getDialogueContainer() {
        throw new Error('getDialogueContainer must be implemented by subclass');
    }

    getUserMessageSelector() {
        throw new Error('getUserMessageSelector must be implemented by subclass');
    }

    getAssistantMessageSelector() {
        throw new Error('getAssistantMessageSelector must be implemented by subclass');
    }

    // 通用方法
    async init() {
        console.log(`🚀 ${this.constructor.name} 初始化中...`);
        
        // 检查页面是否加载完成
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }

        await this.waitForPageReady();
        this.createSidebar();
        this.bindEvents();
        
        console.log(`✅ ${this.constructor.name} 初始化完成`);
    }

    async waitForPageReady() {
        // 等待对话容器出现
        let retries = 0;
        const maxRetries = 30;
        
        while (retries < maxRetries) {
            const container = document.querySelector(this.getDialogueContainer());
            if (container) {
                console.log('✅ 对话容器已就绪');
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries++;
        }
        
        console.warn('⚠️ 等待对话容器超时');
    }

    createSidebar() {
        // 检查是否已经存在侧边栏
        if (document.getElementById('claude-mindmap-sidebar')) {
            console.log('侧边栏已存在，跳过创建');
            return;
        }

        // 创建侧边栏HTML
        const sidebarHTML = this.getSidebarHTML();
        
        // 插入到页面
        const sidebarElement = document.createElement('div');
        sidebarElement.id = 'claude-mindmap-sidebar';
        sidebarElement.className = this.currentStyle === 'figma' ? 'figma' : '';
        sidebarElement.innerHTML = sidebarHTML;
        
        document.body.appendChild(sidebarElement);

        // 初始化侧边栏逻辑
        this.initSidebar();
    }

    getSidebarHTML() {
        return `
            <div class="sidebar-container">
                <div class="sidebar-header">
                    <div class="header-title">
                        <span class="topic-icon"><img src="${chrome.runtime.getURL('icons/ph-palette.svg')}" alt="主题" style="width: 18px; height: 18px;"></span>
                        AI对话主题助手
                    </div>
                    <div class="header-actions">
                        <button class="action-btn" id="mindmap-refreshBtn" title="重新分析"><img src="${chrome.runtime.getURL('icons/ph-refresh.svg')}" alt="刷新" style="width: 16px; height: 16px;"></button>
                        <button class="action-btn" id="mindmap-styleBtn" title="收起所有"><img src="${chrome.runtime.getURL('icons/ph-close.svg')}" alt="收起" style="width: 16px; height: 16px;"></button>
                        <button class="close-btn" id="mindmap-closeBtn" title="关闭"><img src="${chrome.runtime.getURL('icons/ph-x.svg')}" alt="关闭" style="width: 14px; height: 14px;"></button>
                    </div>
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
                        <div class="empty-icon"><img src="${chrome.runtime.getURL('icons/ph-chats.svg')}" alt="对话" style="width: 48px; height: 48px; opacity: 0.5;"></div>
                        <div class="empty-text">暂无对话主题</div>
                        <div class="empty-subtext">开始对话后，侧边栏将自动分析并生成主题列表</div>
                    </div>
                    <div class="topics-timeline" id="mindmap-topicsList"></div>
                </div>
            </div>
        `;
    }

    async initSidebar() {
        // 检查扩展上下文
        if (!this.isExtensionContextValid()) {
            console.error('❌ 扩展上下文无效，无法初始化侧边栏');
            return;
        }

        try {
            // 动态导入侧边栏逻辑
            const { MindmapSidebar } = await import(chrome.runtime.getURL('shared/sidebar.js'));
            this.sidebar = new MindmapSidebar(this);
            this.sidebar.init();
        } catch (error) {
            console.error('❌ 初始化侧边栏失败:', error);
            if (error.message.includes('Extension context invalidated')) {
                console.warn('⚠️ 扩展需要重新加载，请刷新页面');
            }
        }
    }

    bindEvents() {
        // 监听页面变化
        this.observePageChanges();
        
        // 监听URL变化
        this.observeUrlChanges();
        
        // 监听键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'M') {
                this.toggleSidebar();
            }
        });
    }

    observePageChanges() {
        const container = document.querySelector(this.getDialogueContainer());
        if (!container) return;

        const observer = new MutationObserver(() => {
            // 延迟处理，避免频繁触发
            clearTimeout(this.updateTimeout);
            this.updateTimeout = setTimeout(() => {
                this.handlePageUpdate();
            }, 1000);
        });

        observer.observe(container, {
            childList: true,
            subtree: true
        });
    }

    async handlePageUpdate() {
        if (this.isAnalyzing) return;
        
        const newDialogue = this.extractDialogue();
        if (this.hasDialogueChanged(newDialogue)) {
            console.log('🔄 检测到对话更新');
            this.dialogue = newDialogue;
            // 可以在这里触发重新分析
        }
    }

    observeUrlChanges() {
        let currentUrl = window.location.href;
        
        const checkUrlChange = () => {
            if (window.location.href !== currentUrl) {
                const oldUrl = currentUrl;
                currentUrl = window.location.href;
                console.log('🔄 URL变化，重新初始化', { from: oldUrl, to: currentUrl });
                
                // 重置当前状态
                this.dialogue = [];
                this.topics = [];
                
                // 重置侧边栏状态并重新加载
                if (this.sidebar) {
                    this.sidebar.resetState();
                    setTimeout(async () => {
                        // 等待页面加载，然后重新初始化（包括加载缓存）
                        await this.waitForPageReady();
                        this.sidebar.initializeContent();
                    }, 1000);
                }
            }
        };
        
        // 定期检查URL变化
        setInterval(checkUrlChange, 1000);
        
        // 监听浏览器前进后退
        window.addEventListener('popstate', checkUrlChange);
        
        // 监听pushState和replaceState（用于SPA导航）
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(...args) {
            originalPushState.apply(history, args);
            setTimeout(checkUrlChange, 100);
        };
        
        history.replaceState = function(...args) {
            originalReplaceState.apply(history, args);
            setTimeout(checkUrlChange, 100);
        };
    }

    hasDialogueChanged(newDialogue) {
        // 比较时只关注核心内容，忽略DOM元素和时间戳
        const cleanDialogue = (dialogue) => {
            return dialogue.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content
            }));
        };
        
        const cleanNew = cleanDialogue(newDialogue);
        const cleanOld = cleanDialogue(this.dialogue);
        
        return JSON.stringify(cleanNew) !== JSON.stringify(cleanOld);
    }

    // 样式切换
    toggleStyle() {
        const sidebar = document.getElementById('claude-mindmap-sidebar');
        if (!sidebar) return;

        this.currentStyle = this.currentStyle === 'default' ? 'figma' : 'default';
        
        if (this.currentStyle === 'figma') {
            sidebar.classList.add('figma');
        } else {
            sidebar.classList.remove('figma');
        }

        // 重新渲染侧边栏内容
        if (this.sidebar && this.topics.length > 0) {
            this.sidebar.updateTopics(this.topics);
        }

        console.log(`🎨 样式已切换到: ${this.currentStyle}`);
    }

    // 侧边栏显示/隐藏
    showSidebar() {
        const sidebar = document.getElementById('claude-mindmap-sidebar');
        if (sidebar) {
            console.log('✅ 找到侧边栏，添加visible类');
            sidebar.classList.add('visible');
            
            // 调试：检查样式状态
            console.log('侧边栏位置:', window.getComputedStyle(sidebar).right);
            console.log('侧边栏可见性:', window.getComputedStyle(sidebar).visibility);
            console.log('侧边栏显示:', window.getComputedStyle(sidebar).display);
        } else {
            console.error('❌ 未找到侧边栏元素！');
        }
    }

    hideSidebar() {
        const sidebar = document.getElementById('claude-mindmap-sidebar');
        if (sidebar) {
            sidebar.classList.remove('visible');
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('claude-mindmap-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('visible');
        }
    }

    // 抽象方法的默认实现 - 子类可以覆盖
    extractDialogue() {
        // 子类应该实现具体的对话提取逻辑
        return [];
    }

    // 存储相关方法
    async saveToStorage() {
        // 检查扩展上下文是否有效
        if (!this.isExtensionContextValid()) {
            console.warn('⚠️ 扩展上下文无效，跳过存储保存');
            return;
        }

        const currentUrl = this.getCurrentUrl();
        const dataToSave = {
            topics: this.topics,
            dialogue: this.dialogue, // 确保保存对话数据用于比较
            currentStyle: this.currentStyle,
            timestamp: Date.now(),
            url: currentUrl
        };

        try {
            await chrome.storage.local.set({
                [`mindmap_${currentUrl}`]: dataToSave
            });
            console.log('✅ 数据已保存到存储');
        } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
                console.warn('⚠️ 扩展上下文已失效，无法保存数据。请刷新页面重新加载扩展。');
            } else {
                console.error('❌ 保存数据失败:', error);
            }
        }
    }

    async loadFromStorage() {
        // 检查扩展上下文是否有效
        if (!this.isExtensionContextValid()) {
            console.warn('⚠️ 扩展上下文无效，跳过存储加载');
            return null;
        }

        const currentUrl = this.getCurrentUrl();
        
        try {
            const result = await chrome.storage.local.get([`mindmap_${currentUrl}`]);
            const data = result[`mindmap_${currentUrl}`];
            
            if (data && this.isDataValid(data)) {
                this.topics = data.topics || [];
                this.currentStyle = data.currentStyle || 'default';
                console.log('✅ 从存储加载数据成功');
                return data;
            }
        } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
                console.warn('⚠️ 扩展上下文已失效，无法加载数据。请刷新页面重新加载扩展。');
            } else {
                console.error('❌ 加载存储数据失败:', error);
            }
        }
        
        return null;
    }

    // 检查扩展上下文是否有效
    isExtensionContextValid() {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id);
        } catch (error) {
            return false;
        }
    }

    isDataValid(data) {
        const ONE_DAY = 24 * 60 * 60 * 1000;
        return data && data.timestamp && (Date.now() - data.timestamp) < ONE_DAY;
    }

    getCurrentUrl() {
        // 简化URL作为存储key
        return `${window.location.hostname}${window.location.pathname}`;
    }

    // 分析相关方法
    async startAnalysis() {
        if (this.isAnalyzing) {
            console.log('⚠️ 分析已在进行中');
            return;
        }

        console.log('🔍 开始分析对话...');
        this.isAnalyzing = true;

        try {
            // 先尝试从存储加载
            const cachedData = await this.loadFromStorage();
            if (cachedData && cachedData.topics && cachedData.topics.length > 0) {
                console.log('📂 使用缓存的分析结果');
                this.topics = cachedData.topics;
                
                // 更新UI
                if (this.sidebar) {
                    this.sidebar.updateTopics(this.topics);
                }
                
                this.isAnalyzing = false;
                return;
            }

            // 提取对话
            this.dialogue = this.extractDialogue();
            
            if (this.dialogue.length === 0) {
                console.log('⚠️ 未找到对话内容');
                this.showEmptyState();
                this.isAnalyzing = false;
                return;
            }

            console.log(`📝 提取到 ${this.dialogue.length} 条对话`);

            // 如果没有足够的对话内容，显示空状态
            if (this.dialogue.length === 0) {
                console.log('⚠️ 没有对话内容，显示空状态');
                this.showEmptyState();
                this.isAnalyzing = false;
                return;
            }
            
            if (this.dialogue.length < 2) {
                console.log('⚠️ 对话内容不足(少于2条)，使用问题导航模式');
                
                const analysisResult = this.generateQuestionNavigator(this.dialogue);
                // 添加降级标记以便UI显示通知
                analysisResult._fallback = true;
                analysisResult._fallback_reason = '对话内容较少';
                analysisResult._fallback_detail = `当前对话数量：${this.dialogue.length}条，需要至少2条对话才能进行AI主题分析`;
                
                this.topics = analysisResult.nodes || [];
                
                // 更新UI
                if (this.sidebar) {
                    this.sidebar.updateTopics(this.topics, analysisResult);
                }
                
                this.isAnalyzing = false;
                return;
            }

            // 调用AI分析API或使用问题导航模式
            let analysisResult;
            console.log('🤖 开始AI分析...');
            try {
                analysisResult = await this.callAnalysisAPI(this.dialogue);
                console.log('✅ AI分析成功', analysisResult);
            } catch (error) {
                console.error('❌ AI分析失败:', error);
                console.log('🔄 回退到问题导航模式');
                
                analysisResult = this.generateQuestionNavigator(this.dialogue);
                // 添加失败标记以便UI显示通知
                analysisResult._fallback = true;
                analysisResult._fallback_reason = this.getErrorMessage(error);
                analysisResult._fallback_detail = error.message || '未知错误';
            }
            
            this.topics = analysisResult.nodes || [];
            
            // 保存到存储
            await this.saveToStorage();
            
            // 更新UI
            if (this.sidebar) {
                this.sidebar.updateTopics(this.topics, analysisResult);
            }

        } catch (error) {
            console.error('❌ 分析失败:', error);
            this.showErrorState(error.message);
        } finally {
            this.isAnalyzing = false;
        }
    }

    showEmptyState() {
        if (this.sidebar) {
            this.sidebar.showEmptyState();
        }
    }

    showErrorState(message) {
        if (this.sidebar) {
            this.sidebar.showErrorState(message);
        }
    }

    // 获取用户友好的错误消息
    getErrorMessage(error) {
        const errorStr = error.message || error.toString();
        
        if (errorStr.includes('API key') || errorStr.includes('api_key')) {
            return 'API密钥配置有误，请检查密钥是否正确';
        }
        if (errorStr.includes('rate limit') || errorStr.includes('quota')) {
            return 'API调用次数已达限制，请稍后再试';
        }
        if (errorStr.includes('network') || errorStr.includes('fetch')) {
            return '网络连接失败，请检查网络状态';
        }
        if (errorStr.includes('timeout')) {
            return 'AI分析超时，请稍后重试';
        }
        if (errorStr.includes('unauthorized') || errorStr.includes('401')) {
            return 'API密钥验证失败，请检查密钥配置';
        }
        
        return 'AI分析服务暂时不可用，已切换到问题导航模式';
    }

    // 显示失败通知
    showFailureNotification(userMessage, technicalError) {
        if (this.sidebar) {
            this.sidebar.showFailureNotification(userMessage, technicalError);
        }
    }

    // 默认的AI分析方法 - 子类可以覆盖
    async callAnalysisAPI(dialogue) {
        // 检查是否有扩展上下文来调用background script
        if (!this.isExtensionContextValid()) {
            throw new Error('扩展上下文无效，无法调用AI分析');
        }

        // 调用background script进行AI分析
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'analyze_themes',
                dialogue: dialogue
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response?.error || 'AI分析失败'));
                }
            });
        });
    }

    // 生成问题导航器作为回退方案
    generateQuestionNavigator(dialogue) {
        console.log('📋 生成问题导航模式...');
        
        const nodes = [];
        let questionIndex = 0;
        
        for (let i = 0; i < dialogue.length; i++) {
            const message = dialogue[i];
            
            // 只为用户消息创建节点
            if (!message || message.role !== 'user') {
                continue;
            }
            
            questionIndex++;
            
            const topic = message.content.length > 60 
                ? message.content.substring(0, 60) + '...' 
                : message.content;
                
            // 寻找对应的AI回答
            const aiMsg = (i + 1 < dialogue.length && dialogue[i + 1].role === 'assistant') 
                ? dialogue[i + 1] : null;
                
            const summary = aiMsg 
                ? (aiMsg.content.length > 120 
                    ? aiMsg.content.substring(0, 120) + '...' 
                    : aiMsg.content)
                : '暂无回复';
            
            const node = {
                id: `q${questionIndex}`,
                topic: topic, // 使用topic而不是title
                summary: summary,
                messageIndexes: aiMsg ? [i, i + 1] : [i],
                topicNumber: questionIndex,
                order: questionIndex,
                isQuestionNavigator: true,
                messages: [
                    { id: i, text: topic, type: 'user' }
                ]
            };
            
            nodes.push(node);
        }
        
        console.log(`✅ 问题导航生成完成，共 ${nodes.length} 个问题`);
        
        return {
            nodes: nodes,
            _fallback: true,
            _mode: 'question_navigator'
        };
    }
}