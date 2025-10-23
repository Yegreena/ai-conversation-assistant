#!/usr/bin/env python3

import re

def fix_css_selectors(input_file, output_file):
    """给CSS选择器添加前缀，防止污染页面样式"""
    
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 修复全局样式
    content = re.sub(r'^/\* 侧边栏基础样式 \*/\n\* \{', 
                     '/* 侧边栏基础样式 - 限制在侧边栏内，防止污染页面 */\n#claude-mindmap-sidebar * {', 
                     content, flags=re.MULTILINE)
    
    # 移除body全局样式
    content = re.sub(r'^body \{[^}]*\}', 
                     '/* 移除body全局样式，防止影响页面 */', 
                     content, flags=re.MULTILINE | re.DOTALL)
    
    # 给所有没有前缀的选择器添加前缀
    lines = content.split('\n')
    fixed_lines = []
    
    for line in lines:
        # 如果是CSS规则开始（以.开头，且不是已经有前缀的）
        if re.match(r'^(\s*)\.([a-zA-Z][a-zA-Z0-9_-]*.*)\s*\{', line):
            # 检查是否已经有前缀
            if not '#claude-mindmap-sidebar' in line:
                # 添加前缀
                line = re.sub(r'^(\s*)\.', r'\1#claude-mindmap-sidebar .', line)
        
        fixed_lines.append(line)
    
    # 特殊处理sidebar-container，添加基础样式
    fixed_content = '\n'.join(fixed_lines)
    fixed_content = re.sub(
        r'(#claude-mindmap-sidebar \.sidebar-container \{[^}]*)',
        r'\1\n    font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif;\n    font-size: 14px;\n    line-height: 1.5;\n    color: #333;',
        fixed_content
    )
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(fixed_content)

if __name__ == '__main__':
    fix_css_selectors('/Users/yegreena/Documents/addon/sidebar.css', 
                      '/Users/yegreena/Documents/ai-conversation-assistant/sidebar.css')
    print("CSS修复完成！")