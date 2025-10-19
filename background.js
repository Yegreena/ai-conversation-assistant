// background-clean.js - 清理语法错误后的版本

// ==================== 配置管理 ==================== 
const AI_CONFIGS = {
    openai: {
        name: 'OpenAI GPT',
        baseUrl: 'https://api.openai.com/v1',
        endpoint: '/chat/completions',
        defaultModel: 'gpt-3.5-turbo',
        apiKey: '',
        maxTokens: 1500,
        temperature: 0.3
    },
    claude: {
        name: 'Claude',
        baseUrl: 'https://api.anthropic.com/v1',
        endpoint: '/messages',
        defaultModel: 'claude-3-haiku-20240307',
        apiKey: '',
        maxTokens: 1500,
        temperature: 0.3
    },
    kimi: {
        name: 'Kimi Moonshot',
        baseUrl: 'https://api.moonshot.cn/v1',
        endpoint: '/chat/completions',
        defaultModel: 'moonshot-v1-8k',
        apiKey: '', //不再硬编码
        maxTokens: 1500, // 输出token限制，输入+输出不能超过8192
        temperature: 0.3
    },
    local: {
        name: '本地代理',
        baseUrl: 'http://localhost:11434/v1',
        endpoint: '/chat/completions',
        defaultModel: 'llama2',
        apiKey: 'ollama',
        maxTokens: 1500,
        temperature: 0.3
    }
};

let CURRENT_PROVIDER = 'kimi';
let USER_CONFIG = null;

// ==================== 存储管理 ==================== 
chrome.runtime.onInstalled.addListener(async () => {
    console.log('🚀 AI Chrome扩展已安装');
    try {
        // 先初始化默认配置
        await initializeDefaultConfig();
        // 再加载用户配置
        await loadUserConfig();
        console.log('✅ 扩展初始化完成');
    } catch (error) {
        console.error('❌ 扩展初始化失败:', error);
    }
});

// 监听存储变化，当用户更改AI设置时自动重新加载配置
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local') {
        let shouldReload = false;
        
        if (changes.aiProvider) {
            console.log('🔄 AI提供商已更改:', changes.aiProvider.oldValue, '->', changes.aiProvider.newValue);
            shouldReload = true;
        }
        
        if (changes.apiKeys) {
            console.log('🔄 API密钥已更新');
            shouldReload = true;
        }
        
        if (changes.customEndpoints) {
            console.log('🔄 自定义端点已更新');
            shouldReload = true;
        }
        
        if (shouldReload) {
            console.log('♻️ 重新加载AI配置...');
            await loadUserConfig();
        }
    }
});

async function initializeDefaultConfig() {
    try {
        const result = await chrome.storage.local.get('aiProvider');
        if (result.aiProvider) {
            console.log('✅ 用户配置已存在，跳过默认设置。');
            return;
        }

        // 仅在首次安装时设置默认配置
        console.log('🔧 首次安装，设置默认Kimi配置...');
        const defaultConfig = {
            aiProvider: 'kimi',
            apiKeys: {
                kimi: '',
                openai: '',
                claude: '',
                local: 'ollama'
            },
            customEndpoints: {
                kimi: 'https://api.moonshot.cn/v1',
                openai: 'https://api.openai.com/v1', 
                claude: 'https://api.anthropic.com/v1',
                local: 'http://localhost:11434/v1'
            }
        };

        await chrome.storage.local.set(defaultConfig);
        console.log('✅ 默认Kimi配置已设置');
    } catch (error) {
        console.error('❌ 默认配置初始化失败:', error);
    }
}

async function loadUserConfig() {
    try {
        const result = await chrome.storage.local.get(['aiProvider', 'apiKeys', 'customEndpoints']);
        if (result.aiProvider) CURRENT_PROVIDER = result.aiProvider;
        if (result.apiKeys) {
            Object.keys(result.apiKeys).forEach(provider => {
                if (AI_CONFIGS[provider]) {
                    AI_CONFIGS[provider].apiKey = result.apiKeys[provider];
                }
            });
        }
        if (result.customEndpoints) {
            Object.keys(result.customEndpoints).forEach(provider => {
                if (AI_CONFIGS[provider]) {
                    AI_CONFIGS[provider].baseUrl = result.customEndpoints[provider];
                }
            });
        }
        console.log('✅ 配置加载完成，当前提供商:', CURRENT_PROVIDER);
        console.log('🔍 当前AI配置详情:', {
            provider: CURRENT_PROVIDER,
            apiKey: AI_CONFIGS[CURRENT_PROVIDER]?.apiKey?.substring(0, 10) + '...', 
            baseUrl: AI_CONFIGS[CURRENT_PROVIDER]?.baseUrl,
            model: AI_CONFIGS[CURRENT_PROVIDER]?.defaultModel
        });
    } catch (error) {
        console.log('⚠️ 配置加载失败，使用默认配置:', error);
    }
}

function getCurrentAIConfig() {
    return AI_CONFIGS[CURRENT_PROVIDER] || AI_CONFIGS.kimi;
}

// ==================== 智能对话处理器 ==================== 
async function smartDialogueProcessor(dialogue, tabId) {
    const maxTokens = 6000; // 总输入限制6000tokens，为1500输出tokens预留空间
    const estimatedCharsPerToken = 2.0; // 保守估算：2字符=1token
    const maxChars = maxTokens * estimatedCharsPerToken;
    
    // 建立用户消息索引映射
    const userMessageMapping = [];
    dialogue.forEach((msg, index) => {
        if (msg.role === 'user') {
            userMessageMapping.push(index);
        }
    });
    
    // 计算当前对话长度 - 只给用户消息编号（恢复之前的格式）
    let userQuestionIndex = 0;
    const fullText = dialogue.map((msg, index) => {
        if (msg.role === 'user') {
            const result = `[${userQuestionIndex}] 用户: ${msg.content}`;
            userQuestionIndex++;
            return result;
        } else {
            return `AI: ${msg.content}`;
        }
    }).join('\n');
    
    console.log(`📋 用户消息映射: ${userMessageMapping.length}个用户消息`, userMessageMapping);
    
    console.log(`📐 对话长度评估: ${fullText.length}字符 / ${Math.ceil(fullText.length/estimatedCharsPerToken)}tokens (限制:${maxTokens})`);
    
    if (fullText.length <= maxChars) {
        console.log('✅ 对话长度适中，无需压缩');
        return { 
            text: fullText, 
            messageCount: dialogue.length,
            strategy: '无压缩',
            userMessageMapping: userMessageMapping
        };
    }
    
    await sendProgressUpdate(tabId, 15, '对话过长，智能压缩中...');
    
    // 策略1: 智能摘要压缩（优先）
    console.log('🔄 策略1: 智能摘要压缩...');
    const compressedDialogue = smartCompress(dialogue, maxChars, userMessageMapping);
    if (compressedDialogue.text.length <= maxChars) {
        return compressedDialogue;
    }
    
    // 策略2: 分段分析（回退）
    console.log('🔄 策略2: 分段分析...');
    return await segmentedAnalysis(dialogue, maxChars, tabId, userMessageMapping);
}

function smartCompress(dialogue, maxChars, userMessageMapping) {
    console.log('🎯 开始智能压缩...');
    
    const compressed = [];
    let currentLength = 0;
    const targetLength = maxChars * 0.85; // 留15%余量，平衡压缩率和信息量
    let userQuestionIndex = 0;
    
    // 策略：适度压缩，保留关键信息用于分析
    for (let i = 0; i < dialogue.length; i++) {
        const msg = dialogue[i];
        let content = msg.content;
        
        if (msg.role === 'user') {
            // 用户问题：保留更多内容以便理解意图（最多150字符）
            if (content.length > 150) {
                content = content.substring(0, 145) + '...';
            }
        } else {
            // AI回答：保留更多完整内容（最多300字符，优先保留完整句子）
            content = compressAIResponse(msg.content);
            if (content.length > 300) {
                // 尝试在句号处截断，保持句子完整性
                const truncated = content.substring(0, 295);
                const lastSentence = truncated.lastIndexOf('。');
                const lastPeriod = truncated.lastIndexOf('.');
                const cutPoint = Math.max(lastSentence, lastPeriod);
                
                if (cutPoint > 200) { // 如果找到合适的断点且不会太短
                    content = content.substring(0, cutPoint + 1) + '...';
                } else {
                    content = content.substring(0, 295) + '...';
                }
            }
        }
        
        // 使用之前的格式：只给用户消息编号
        const formattedMsg = msg.role === 'user' 
            ? `[${userQuestionIndex}] 用户: ${content}`
            : `AI: ${content}`;
            
        if (msg.role === 'user') {
            userQuestionIndex++;
        }
        
        if (currentLength + formattedMsg.length > targetLength) {
            console.log(`⚠️ 达到长度限制，停止在第${i}条消息`);
            break;
        }
        
        compressed.push(formattedMsg);
        currentLength += formattedMsg.length + 1;
    }
    
    const result = compressed.join('\n');
    console.log(`✅ 智能压缩完成: ${dialogue.length}条 -> ${compressed.length}条, ${result.length}字符`);
    
    return {
        text: result,
        messageCount: compressed.length,
        strategy: `智能压缩(${Math.round(result.length/dialogue.map(m=>m.content).join('').length*100)}%)`,
        userMessageMapping: userMessageMapping
    };
}

function compressAIResponse(content) {
    if (content.length <= 250) return content;
    
    // 智能压缩：保留更多完整内容，优先保留句子完整性
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length <= 4) {
        // 行数很少，保留更多内容，在句子边界截断
        if (content.length <= 400) return content;
        
        const truncated = content.substring(0, 395);
        const lastSentence = Math.max(
            truncated.lastIndexOf('。'),
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('！'),
            truncated.lastIndexOf('？')
        );
        
        if (lastSentence > 250) {
            return content.substring(0, lastSentence + 1) + '...';
        } else {
            return content.substring(0, 395) + '...';
        }
    }
    
    const compressed = [];
    const totalLines = lines.length;
    
    // 策略：保留头尾 + 中间关键信息，但保留更多内容
    // 头部：前3行
    compressed.push(...lines.slice(0, Math.min(3, totalLines)));
    
    // 中间部分：关键信息识别
    if (totalLines > 6) {
        const middleLines = lines.slice(3, totalLines - 3);
        const keyPatterns = [
            /^(总结|要点|重点|核心|关键|结论|答案|解决方案)[:：]/,
            /^[0-9]+[\.、]/,  // 编号列表
            /^[•\-\*]/,       // 无序列表
            /^#+\s/,          // 标题
            /(建议|推荐|注意|重要|关键|错误|问题|解决|方法|步骤)/,
            /(因此|所以|总之|综上|最后|最终)/  // 结论性词汇
        ];
        
        const importantMiddleLines = middleLines.filter(line => 
            keyPatterns.some(pattern => pattern.test(line))
        ).slice(0, 3); // 最多保留3行关键信息
        
        if (importantMiddleLines.length > 0) {
            compressed.push('...');
            compressed.push(...importantMiddleLines);
        } else if (middleLines.length > 0) {
            // 如果没有识别到关键信息，保留中间2行作为代表
            compressed.push('...');
            const mid = Math.floor(middleLines.length / 2);
            compressed.push(middleLines[Math.max(0, mid - 1)]);
            if (middleLines.length > 1) {
                compressed.push(middleLines[mid]);
            }
        }
    }
    
    // 尾部：后3行
    if (totalLines > 3) {
        if (compressed.length > 3) compressed.push('...');
        compressed.push(...lines.slice(Math.max(0, totalLines - 3)));
    }
    
    let result = compressed.join('\n');
    
    // 控制总长度在350字符内，但优先保留完整句子
    if (result.length > 350) {
        const truncated = result.substring(0, 345);
        const lastComplete = Math.max(
            truncated.lastIndexOf('。'),
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('\n')
        );
        
        if (lastComplete > 250) {
            result = result.substring(0, lastComplete + 1) + '...';
        } else {
            result = result.substring(0, 345) + '...';
        }
    }
    
    return result || content.substring(0, 200) + '...';
}

async function segmentedAnalysis(dialogue, maxChars, tabId, userMessageMapping) {
    console.log('📊 开始分段分析...');
    await sendProgressUpdate(tabId, 20, '长对话分段处理中...');
    
    // 将对话分成多个段落，分别分析再合并
    const segmentSize = Math.floor(dialogue.length / 3); // 分3段
    const segments = [];
    
    for (let i = 0; i < dialogue.length; i += segmentSize) {
        const segment = dialogue.slice(i, i + segmentSize);
        segments.push(segment);
    }
    
    // 对每段进行摘要
    const summaries = segments.map((segment, segIndex) => {
        let userQuestionIndex = segIndex * Math.ceil(userMessageMapping.length / segments.length);
        const segmentText = segment.map((msg, msgIndex) => {
            const content = msg.role === 'assistant' ? compressAIResponse(msg.content) : msg.content;
            
            if (msg.role === 'user') {
                const result = `[${userQuestionIndex}] 用户: ${content}`;
                userQuestionIndex++;
                return result;
            } else {
                return `AI: ${content}`;
            }
        }).join('\n');
        
        return `\n=== 对话段落 ${segIndex + 1} ===\n${segmentText}`;
    });
    
    const result = summaries.join('\n');
    
    console.log(`✅ 分段完成: ${dialogue.length}条消息 -> ${segments.length}个段落, ${result.length}字符`);
    
    return {
        text: result,
        messageCount: dialogue.length,
        strategy: `分段分析(${segments.length}段)`,
        userMessageMapping: userMessageMapping
    };
}

// ==================== 核心AI分析函数 ==================== 
async function analyzeDialogueThemes(dialogue, tabId) {
    try {
        await sendProgressUpdate(tabId, 5, '准备分析数据...');
        console.log('🎯 开始AI主题识别，对话长度:', dialogue.length);
        
        if (!dialogue || !Array.isArray(dialogue) || dialogue.length === 0) {
            console.warn('⚠️ 对话数据无效，使用问题导航');
            return generateQuestionNavigator(dialogue, tabId);
        }
        
        const validMessages = dialogue.filter(msg => msg && msg.content && msg.content.trim().length > 0);
        if (validMessages.length === 0) {
            console.warn('⚠️ 对话内容为空，使用问题导航');
            return generateQuestionNavigator(dialogue, tabId);
        }

        await sendProgressUpdate(tabId, 10, '智能处理对话内容...');
        
        // 智能对话压缩和分段处理
        const processedDialogue = await smartDialogueProcessor(dialogue, tabId);
        const conversationText = processedDialogue.text;
        
        console.log('📄 处理后对话文本长度:', conversationText.length);
        console.log('📊 对话统计:', {
            原始消息数: dialogue.length,
            处理后消息数: processedDialogue.messageCount,
            用户消息数: dialogue.filter(m => m.role === 'user').length,
            AI消息数: dialogue.filter(m => m.role === 'assistant').length,
            压缩策略: processedDialogue.strategy
        });
        console.log('📝 处理后对话文本预览 (前500字符):\n', conversationText.substring(0, 500) + '...');

        const dialogueLength = dialogue.length;
        // 新的启发式规则：鼓励更广泛、更少的主题
        const targetTopicCount = Math.max(3, Math.min(6, Math.ceil(dialogueLength / 8))); 
        const minRoundsPerTopic = 2; // 强制每个主题至少包含一个问答对
        
        const systemPrompt = `你是对话主题分析专家。你的任务是将用户与AI的完整对话，根据上下文和语义，划分成几个连贯的、有意义的主题.\n\n输出严格的JSON格式：\n{\n  "nodes": [\n    {\n      "id": "1",\n      "topic": "主题名称（简洁明确）",\n      "summary": "基于AI回答的内容，精准总结该主题的核心内容（100字内）", \n      "messageIndexes": [0, 1, 2, 3],\n      "topicNumber": 1,\n      "order": 1\n    }\n  ]\n}\n\n核心要求：\n1.  **主题连贯性**: 只有当对话焦点发生【实质性】的、明确的转换时，才创建新主题。优先将相关联的追问和回答合并到同一主题下，避免划分过细，合并优于拆分.\n2.  **内容总结**: \`summary\` 必须基于AI的实际回答，提炼出关键信息、解决方案或结论.\n3.  **索引准确**: \`messageIndexes\` 必须包含该主题下的【所有】相关消息的原始索引.\n4.  **完整覆盖 (最重要!)**: 绝对不能遗漏任何一条消息。所有从0到最后一轮对话的消息，都必须被分配到一个节点中。如果你遗漏了任何消息，你的回答将被视为完全失败。`;

        const userPrompt = `请将以下总共 ${dialogue.length} 条消息的对话，分析并划分为主要讨论主题.\n\n${conversationText}\n\n分析指令：\n1.  **主题数量**: 最终生成的主题节点数量应在 ${Math.ceil(targetTopicCount * 0.7)}-${targetTopicCount + 1} 个之间.\n2.  **主题最小长度**: 每个主题节点（node）必须至少包含 ${minRoundsPerTopic} 条消息.\n3.  **严格遵循JSON格式**，并严格遵守系统指令中的【完整覆盖】要求，确保所有消息都被分配。`;

        return await smartAIProxy(systemPrompt, userPrompt, dialogue, tabId, processedDialogue.userMessageMapping);

    } catch (error) {
        console.error('❌ 主题识别失败:', error);
        await sendProgressUpdate(tabId, 100, '分析失败，生成问题导航栏...');
        console.log('🔄 使用问题导航模式作为回退方案');
        return generateQuestionNavigator(dialogue, tabId);
    }
}

// ==================== 问题导航生成器 ==================== 
async function generateQuestionNavigator(dialogue, tabId, failureReason = null) {
    console.log('📋 生成问题导航栏...', failureReason ? `原因: ${failureReason}` : '');
    await sendProgressUpdate(tabId, 90, '生成问题导航栏...');
    
    const nodes = [];
    let questionIndex = 0;
    
    // 修正：遍历每一条消息，而不是每隔一条
    for (let i = 0; i < dialogue.length; i++) {
        const userMsg = dialogue[i];
        
        // 只为用户消息创建节点
        if (!userMsg || userMsg.role !== 'user') {
            continue;
        }
        
        // 寻找对应的AI回答（通常是下一条）
        const aiMsg = (i + 1 < dialogue.length && dialogue[i + 1].role === 'assistant') ? dialogue[i + 1] : null;
        
        questionIndex++;
        
        const topic = userMsg.content.length > 60 
            ? userMsg.content.substring(0, 60) + '...' 
            : userMsg.content;
            
        const summary = aiMsg 
            ? (aiMsg.content.length > 120 
                ? aiMsg.content.substring(0, 120) + '...' 
                : aiMsg.content)
            : '暂无回复';
        
        const node = {
            id: `q${questionIndex}`,
            topic: topic,
            summary: summary,
            messageIndexes: aiMsg ? [i, i + 1] : [i], // 如果有AI回答，则包含其索引
            topicNumber: questionIndex,
            order: questionIndex,
            type: 'question',
            color: 'blue',
            isQuestionNavigator: true,
            // 隐藏展开的用户问题列表
            hideMessagesList: true
        };
        
        nodes.push(node);
        console.log(`✅ 生成问题 ${questionIndex}: ${topic}`);
    }
    
    console.log(`🎯 问题导航栏生成完成，共 ${nodes.length} 个问题`);
    
    return {
        nodes: nodes,
        edges: [], // 问题导航模式不需要连线
        _fallback: true,
        _mode: 'question_navigator',
        _failureReason: failureReason,
        _canRetry: true
    };
}

// ==================== 智能AI代理 ==================== 
async function smartAIProxy(systemPrompt, userPrompt, dialogue, tabId, userMessageMapping) {
    const config = getCurrentAIConfig();
    await sendProgressUpdate(tabId, 25, `调用${config.name}...`);
    console.log(`🤖 使用 ${config.name} 进行AI分析...`);
    console.log(`📋 系统提示长度: ${systemPrompt.length}, 用户提示长度: ${userPrompt.length}`);
    
    // 检查API密钥
    if (!config.apiKey || config.apiKey === 'YOUR_API_KEY_HERE' || config.apiKey.trim() === '') {
        console.log('⚠️ API密钥未配置，使用问题导航模式');
        return generateQuestionNavigator(dialogue, tabId, 'API密钥未配置，请在设置页面配置API密钥');
    }
    
    // 检查API端点
    if (!config.baseUrl || config.baseUrl.trim() === '') {
        console.log('⚠️ API端点未配置，使用问题导航模式');
        return generateQuestionNavigator(dialogue, tabId, 'API端点未配置，请在设置页面配置API端点');
    }
    
    console.log(`🔑 API密钥检查通过: ${config.apiKey.substring(0, 10)}...`);
    
    let requestBody;
    let headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Chrome-Extension-Mindmap/1.0'
    };
    
    // ... (request body and headers setup remains the same)
    switch (CURRENT_PROVIDER) {
        case 'openai':
        case 'kimi':
        case 'local':
            requestBody = {
                model: config.defaultModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: Math.max(config.maxTokens, 2000), // 确保足够的token生成完整JSON
                temperature: config.temperature,
                stream: false
            };
            headers['Authorization'] = `Bearer ${config.apiKey}`;
            break;
            
        case 'claude':
            requestBody = {
                model: config.defaultModel,
                max_tokens: Math.max(config.maxTokens, 2000), // 确保足够的token生成完整JSON
                temperature: config.temperature,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: userPrompt }
                ]
            };
            headers['x-api-key'] = config.apiKey;
            headers['anthropic-version'] = '2023-06-01';
            break;
            
        default:
            throw new Error(`不支持的AI提供商: ${CURRENT_PROVIDER}`);
    }

    const maxRetries = 3;
    const retryDelay = 1000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await sendProgressUpdate(tabId, 40, `正在等待AI响应... (第${attempt}次)`);
            console.log(`🚀 第${attempt}次尝试调用API...`);
            
            const timeout = attempt === 1 ? 15000 : 30000;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch(`${config.baseUrl}${config.endpoint}`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.log(`❌ API响应错误 (${response.status}): ${errorText}`);
                
                if (response.status === 429 || response.status >= 500) {
                    if (attempt < maxRetries) {
                        await sendProgressUpdate(tabId, 40, `API繁忙，${retryDelay/1000}秒后重试...`);
                        console.log(`⏳ ${retryDelay/1000}秒后重试...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        continue;
                    }
                }
                
                console.log('⚠️ 不可恢复的错误，使用问题导航');
                return generateQuestionNavigator(dialogue, tabId, `API错误: ${response.status}`);
            }
            
            await sendProgressUpdate(tabId, 85, '已收到响应，正在处理...');
            const responseData = await response.json();
            console.log('✅ API调用成功，响应数据结构:', Object.keys(responseData));
            console.log('📊 响应数据预览:', JSON.stringify(responseData).substring(0, 200) + '...');
            
            let aiResponse;
            // ... (aiResponse extraction remains the same)
            switch (CURRENT_PROVIDER) {
                case 'openai':
                case 'kimi':
                case 'local':
                    aiResponse = responseData.choices?.[0]?.message?.content;
                    break;
                case 'claude':
                    aiResponse = responseData.content?.[0]?.text;
                    break;
                default:
                    aiResponse = responseData.choices?.[0]?.message?.content;
            }

            if (!aiResponse) {
                console.log('⚠️ API响应格式异常，使用问题导航');
                console.log('📊 响应数据详情:', JSON.stringify(responseData));
                return generateQuestionNavigator(dialogue, tabId, 'API响应格式错误');
            }
            
            console.log('📄 AI响应内容长度:', aiResponse.length);
            return parseAIResponse(aiResponse, dialogue, tabId, userMessageMapping);
            
        } catch (error) {
            console.log(`⚠️ 第${attempt}次尝试失败:`, error.message);
            
            if (error.name === 'AbortError') console.log('⏰ 请求超时');
            else if (error.message.includes('fetch')) console.log('🌐 网络错误');
            
            if (attempt < maxRetries) {
                await sendProgressUpdate(tabId, 40, '请求失败，准备重试...');
                console.log(`⏳ ${retryDelay/1000}秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                console.log('❌ 所有重试都失败，使用问题导航');
                return generateQuestionNavigator(dialogue, tabId, '网络连接失败');
            }
        }
    }
}

function parseAIResponse(aiResponse, dialogue, tabId, userMessageMapping) {
    try {
        // 安全护栏：在执行任何操作前，验证userMessageMapping的有效性
        if (!userMessageMapping || !Array.isArray(userMessageMapping)) {
            console.error('CRITICAL ERROR: userMessageMapping is invalid inside parseAIResponse!', userMessageMapping);
            return generateQuestionNavigator(dialogue, tabId, '内部错误：缺少消息映射表');
        }

        sendProgressUpdate(tabId, 90, '解析AI返回内容...');
        
        let cleanResponse = aiResponse.trim();
        if (cleanResponse.startsWith('```json')) {
            cleanResponse = cleanResponse.replace(/```json\n?/, '').replace(/```\n?$/, '');
        }
        if (cleanResponse.startsWith('```')) {
            cleanResponse = cleanResponse.replace(/```\n?/, '').replace(/```\n?$/, '');
        }
        
        cleanResponse = fixTruncatedJSON(cleanResponse);
        
        const result = JSON.parse(cleanResponse);
        
        if (result.nodes && Array.isArray(result.nodes)) {
            sendProgressUpdate(tabId, 98, '结构化数据完成！');
            console.log('✅ 成功解析AI返回的JSON，节点数量:', result.nodes.length);
            
            // 转换用户问题编号为原始对话索引
            console.log('🔄 转换用户问题编号为原始对话索引...');
            console.log('📋 用户消息映射表:', userMessageMapping);
            
            result.nodes.forEach((node, nodeIndex) => {
                if (node.messageIndexes && Array.isArray(node.messageIndexes)) {
                    const originalIndexes = node.messageIndexes.map(userQuestionIndex => {
                        const originalIndex = userMessageMapping[userQuestionIndex];
                        console.log(`转换: 用户问题${userQuestionIndex} -> 原始对话索引${originalIndex}`);
                        return originalIndex;
                    }).filter(index => index !== undefined);
                    
                    node.messageIndexes = originalIndexes;
                    console.log(`✅ 节点${nodeIndex + 1}转换完成:`, {
                        topic: node.topic,
                        原始messageIndexes: originalIndexes
                    });
                }
            });
            
            // 使用console.group折叠详细信息
            console.group('📋 AI返回的详细结构（已转换索引）');
            console.log('完整JSON:', result);
            console.groupCollapsed('节点详情');
            result.nodes.forEach((node, index) => {
                console.log(`节点 ${index + 1}:`, {
                    topic: node.topic,
                    messageIndexes: node.messageIndexes,
                    summary: node.summary
                });
            });
            console.groupEnd();
            console.groupEnd();
            
            return result;
        } else {
            console.log('⚠️ AI返回格式不符合要求，缺少nodes数组');
            return generateQuestionNavigator(dialogue, tabId, 'AI返回格式错误');
        }
    } catch (parseError) {
        console.log('⚠️ AI返回格式错误，使用问题导航作为回退');
        console.log('📝 解析错误详情:', parseError.message);
        return generateQuestionNavigator(dialogue, tabId, `解析失败: ${parseError.message}`);
    }
}

function fixTruncatedJSON(jsonStr) {
    try {
        // 先尝试直接解析
        JSON.parse(jsonStr);
        return jsonStr;
    } catch (e) {
        console.log('🔧 尝试修复截断的JSON...');
        
        // 找到最后一个完整的节点
        let fixed = jsonStr;
        
        // 如果JSON在字符串中间截断，尝试找到最后一个完整的节点
        const lastCompleteNode = fixed.lastIndexOf('    }');
        if (lastCompleteNode !== -1) {
            // 截取到最后一个完整节点
            fixed = fixed.substring(0, lastCompleteNode + 6);
            
            // 确保数组和对象正确闭合
            if (!fixed.includes('  ],') && !fixed.includes('  ]')) {
                fixed += '\n  ],';
            }
            if (!fixed.includes('}')) {
                fixed += '\n}';
            }
            
            console.log('🔧 修复后的JSON:', fixed.substring(0, 200) + '...');
            return fixed;
        }
        
        return jsonStr;
    }
}

// ==================== 进度更新函数 ====================
async function sendProgressUpdate(tabId, progress, status) {
    try {
        if (!tabId) return;
        
        await chrome.tabs.sendMessage(tabId, {
            action: "progress_update",
            data: { progress, status }
        });
    } catch (error) {
        console.log('进度更新发送失败:', error);
    }
}

// ==================== 消息监听器 ====================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('🎯 Background收到消息:', request.action);
    
    if (request.action === "ping") {
        // 健康检查消息
        sendResponse({ success: true, status: "Background Script正常运行" });
        return;
    }
    
    if (request.action === "reload_config") {
        // 手动重新加载配置
        loadUserConfig().then(() => {
            console.log('🔄 手动重新加载配置完成');
            sendResponse({ success: true, status: "配置已重新加载" });
        }).catch(error => {
            console.error('❌ 重新加载配置失败:', error);
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }
    
    if (request.action === "analyze_themes") {
        const tabId = sender.tab?.id;
        analyzeDialogueThemes(request.dialogue, tabId)
            .then(result => {
                console.log('✅ 主题分析完成');
                sendResponse({ success: true, data: result });
            })
            .catch(error => {
                console.error('❌ 主题分析失败:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // 保持消息通道开放
    }
    
    sendResponse({ success: false, error: "未知操作" });
});