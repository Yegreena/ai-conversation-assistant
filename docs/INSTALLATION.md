# 安装指南

## 系统要求

- Chrome 浏览器 88+ 版本
- 支持 Manifest V3 的 Chrome 扩展
- 网络连接（用于 AI 分析）

## 安装方式

### 方式一：从源码安装（推荐）

1. **下载源码**
   ```bash
   git clone https://github.com/your-username/ai-conversation-assistant.git
   cd ai-conversation-assistant
   ```

2. **加载到 Chrome**
   - 打开 Chrome 浏览器
   - 在地址栏输入 `chrome://extensions/`
   - 在右上角开启"开发者模式"开关
   - 点击"加载已解压的扩展程序"按钮
   - 选择下载的 `ai-conversation-assistant` 文件夹
   - 插件加载成功后会显示在扩展程序列表中

3. **验证安装**
   - 在工具栏中找到插件图标（🧠）
   - 点击图标，弹出窗口显示"✅ 插件正常运行"
   - 访问 claude.ai，状态应显示"✅ Claude.ai页面"

### 方式二：Chrome 应用商店（计划中）

目前插件还在开发阶段，暂未上架 Chrome 应用商店。

## 配置 AI 服务

### 1. 打开设置页面
- 点击插件图标
- 选择"AI 设置"按钮
- 或者在扩展程序页面点击"详细信息" → "扩展程序选项"

### 2. 选择 AI 提供商

#### OpenAI
- 选择"OpenAI GPT"
- 在 [OpenAI API Keys](https://platform.openai.com/api-keys) 获取 API 密钥
- 将密钥粘贴到"API 密钥"输入框

#### Claude (Anthropic)
- 选择"Claude"
- 在 [Anthropic Console](https://console.anthropic.com/) 获取 API 密钥
- 将密钥粘贴到"API 密钥"输入框

#### Kimi (月之暗面)
- 选择"Kimi Moonshot"
- 在 [Moonshot AI](https://platform.moonshot.cn/) 获取 API 密钥
- 将密钥粘贴到"API 密钥"输入框

#### 本地模型
- 选择"本地代理"
- 确保本地运行了 Ollama 或兼容服务
- 默认端点：`http://localhost:11434/v1`

### 3. 测试配置
- 点击"测试 AI 分析"按钮
- 等待测试完成
- 看到"✅ AI测试成功"表示配置正确

## 使用方法

1. **打开 Claude.ai**
   - 确保在 `https://claude.ai` 域名下
   - 开始与 Claude 的对话

2. **启动思维导图**
   - 点击浏览器工具栏中的插件图标
   - 点击"打开思维导图"按钮
   - 等待分析完成

3. **使用侧边栏**
   - 查看右侧生成的主题列表
   - 点击主题跳转到对应对话位置
   - 拖拽边框调整侧边栏宽度

## 故障排除

### 插件无法加载
- 确认 Chrome 版本支持 Manifest V3
- 检查是否开启了开发者模式
- 尝试重新加载插件

### 无法抓取对话
- 刷新 Claude.ai 页面
- 确认页面完全加载后再使用插件
- 检查浏览器控制台是否有错误信息

### AI 分析失败
- 检查网络连接
- 验证 API 密钥是否正确
- 确认 API 余额充足
- 插件会自动切换到问题导航模式

### 侧边栏不显示
- 确认在 claude.ai 页面使用
- 尝试刷新页面重新加载插件
- 检查是否被广告拦截器阻止

## 卸载插件

1. 打开 `chrome://extensions/`
2. 找到"AI对话助手"
3. 点击"移除"按钮
4. 确认删除

插件相关的本地数据也会被清除。