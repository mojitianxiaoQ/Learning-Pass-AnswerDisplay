// ==UserScript==
// @name         学习通显示答案 
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  强制AI返回带题号的答案，并智能匹配题目 (AI第2题对应原始第1题),关于题号的对应可能存在问题希望能得到其他同学的帮助
// @author       云烁 
// @match        *://mooc1.chaoxing.com/mooc-ans*
// @grant        GM_xmlhttpRequest
// @connect      api.deepseek.com
// ==/UserScript==

(function () {
    'use strict';

    // ================= 配置区 =================
    const CONFIG = {
        apiKey: '', // 请替换为你的 DeepSeek API Key
        model: 'deepseek-chat'
    };
    // =========================================

    // UI 样式增强 (添加题号匹配状态)
    const styles = `
    #ai-assist-btn {
        position: fixed; top: 10px; left: 10px; z-index: 9999; background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    }
    #ai-result-panel {
        position: fixed; top: 60px; right: 20px; width: 350px; max-height: 80vh; overflow-y: auto; background: white; border: 1px solid #ccc; box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 9999; padding: 15px; border-radius: 8px; display: none;
    }
    .result-item {
        margin-bottom: 15px; padding: 10px; border-radius: 5px; background: #f9f9f9; border-left: 3px solid #4CAF50;
    }
    .q-header {
        font-weight: bold; color: #1976D2; margin-bottom: 8px; display: flex; justify-content: space-between;
    }
    .q-num {
        background: #e3f2fd; padding: 2px 8px; border-radius: 10px; font-weight: bold; color: #1565C0;
    }
    .ai-answer {
        color: #d32f2f; font-weight: bold; padding: 5px; background: #ffebee; border-radius: 4px; margin-top: 5px;
    }
    .match-status {
        font-size: 12px; color: #666; margin-top: 3px;
    }
    .loading { color: #999; font-style: italic; }
    .error { color: #d32f2f; }
    `;

    function injectStyles() {
        if (!document.getElementById('ai-script-styles')) {
            const styleSheet = document.createElement("style");
            styleSheet.innerText = styles;
            styleSheet.id = 'ai-script-styles';
            document.head.appendChild(styleSheet);
        }
    }

    // 初始化 UI
    function initUI() {
        injectStyles();
        if (document.getElementById('ai-assist-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'ai-assist-btn';
        btn.innerText = '🔢 AI 智能匹配题号';
        btn.title = '点击后AI将返回带题号的答案 (AI第2题对应本页第1题)';
        btn.onclick = startProcessing;
        document.body.appendChild(btn);

        const panel = document.createElement('div');
        panel.id = 'ai-result-panel';
        panel.innerHTML = '<h3>📌 带题号答案解析</h3><div id="ai-content">等待开始...</div>';
        document.body.appendChild(panel);
    }

    // 核心处理流程
    async function startProcessing() {
        // API Key 检查
        if (!CONFIG.apiKey || CONFIG.apiKey.includes('xxxx') || CONFIG.apiKey.length < 10) {
            alert('❌ 错误：请在脚本代码顶部的 CONFIG 区域填入有效的 DeepSeek API Key！');
            return;
        }
        const panel = document.getElementById('ai-result-panel');
        const contentDiv = document.getElementById('ai-content');
        panel.style.display = 'block';
        contentDiv.innerHTML = '<div class="loading">正在抓取题目原始内容...</div>';

        // 1. 提取原始题目文本 (保留原始题号)
        const rawQuestions = extractRawQuestions();
        if (rawQuestions.length === 0) {
            contentDiv.innerHTML = '<p class="error">未检测到题目，请刷新页面重试。</p>';
            return;
        }
        contentDiv.innerHTML = `<div class="loading">已获取 ${rawQuestions.length} 道题，正在发送给 AI...</div>`;

        try {
            // 2. 构建强制题号格式的 Prompt
            const prompt = buildPrompt(rawQuestions);
            const aiResponse = await callDeepSeek(prompt);

            // 3. 智能解析带题号的答案 (修改版逻辑)
            parseAndRenderResults(aiResponse, rawQuestions);

        } catch (error) {
            contentDiv.innerHTML = `<p class="error">❌ 请求失败: ${error.message}</p>`;
        }
    }

    // 提取原始题目文本 (保留原始题号)
    function extractRawQuestions() {
        const questions = [];
        const containers = document.querySelectorAll('.questionLi, .TiMu, .work-cont');
        containers.forEach((container, index) => {
            // 尝试从标题中提取题号
            let questionNumber = index + 1;
            const titleEl = container.querySelector('.Zy_TItle, .clearfix, .title-top');
            if (titleEl) {
                const titleText = titleEl.innerText;
                // 从标题中提取数字题号 (如 "1. 单选题")
                const numMatch = titleText.match(/^\s*(\d+)[\.、\s]/);
                if (numMatch) questionNumber = parseInt(numMatch[1]);
            }

            // 获取题目完整文本 (清理干扰元素)
            const clone = container.cloneNode(true);
            clone.querySelectorAll('.btn, .note, .collect, .fr, .Zy_Ul, .mark').forEach(el => el.remove());
            const fullText = clone.innerText.trim().replace(/\n{3,}/g, '\n\n');

            if (fullText.length > 10) {
                questions.push({ id: questionNumber, rawText: fullText });
            }
        });
        // 按题号排序 (防止DOM顺序错乱)
        return questions.sort((a, b) => a.id - b.id);
    }

    // 构建强制题号格式的 Prompt
    function buildPrompt(questions) {
        let prompt = `你是一个考试助手，请严格按以下规则回答：\n\n`;
        prompt += `**核心规则**\n`;
        prompt += `1. 必须为每道题单独回复，格式：\n "[题号]. [答案]"\n`;
        prompt += `2. 题号必须使用我提供的原始题号（不是你重新排序的）\n`;
        prompt += `3. 答案内容：\n`;
        prompt += ` - 选择题：仅输出选项字母（如 "A"、"BC"）\n`;
        prompt += ` - 判断题：输出"对"或"错"\n`;
        prompt += ` - 简答题：输出关键答案短语（不超过20字）\n`;
        prompt += `4. 禁止任何解释、分析或额外文字\n\n`;

        prompt += `**题目列表**\n`;
        questions.forEach(q => {
            prompt += `--- [${q.id}] ---\n${q.rawText}\n\n`;
        });

        prompt += `**开始回复**\n`;
        return prompt;
    }

    // 调用 DeepSeek API
    function callDeepSeek(prompt) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: "https://api.deepseek.com/v1/chat/completions",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${CONFIG.apiKey}`
                },
                data: JSON.stringify({
                    model: CONFIG.model,
                    messages: [
                        {
                            role: "system",
                            content: "你是一个严格的答题机器，必须100%遵守用户的格式要求。任何解释都会导致任务失败。"
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.0 // 关闭随机性
                }),
                onload: function(response) {
                    try {
                        const json = JSON.parse(response.responseText);
                        if (json.choices?.[0]?.message?.content) {
                            resolve(json.choices[0].message.content);
                        } else {
                            reject(new Error("API 返回无有效内容"));
                        }
                    } catch (e) {
                        reject(new Error("JSON解析失败: " + e.message));
                    }
                },
                onerror: function(err) {
                    reject(new Error("网络错误: " + err.status));
                }
            });
        });
    }

    // 智能解析带题号的答案
    function parseAndRenderResults(aiResponse, originalQuestions) {
        const contentDiv = document.getElementById('ai-content');
        contentDiv.innerHTML = ''; // 清空

        // 1. 尝试匹配标准题号格式
        const results = [];
        const lines = aiResponse.split('\n').filter(line => line.trim());

        // 匹配模式: [题号]. [答案] 或 [题号]、[答案] 等
        const pattern = /^\s*\[?(\d+)\]?\s*[\.\:、]\s*([A-Z0-9\u4e00-\u9fa5]+[A-Z0-9\u4e00-\u9fa5\s]*)/i;
        lines.forEach(line => {
            const match = line.match(pattern);
            if (match) {
                const num = parseInt(match[1]);
                const answer = match[2].trim();
                results.push({ num, answer, line });
            }
        });

        // 2. 按题号排序 AI 回复
        const sortedAIResults = results.sort((a, b) => a.num - b.id);

        // 3. 核心逻辑：构建映射关系 (AI第2题 -> 原始第1题, AI第3题 -> 原始第2题...)
        const finalMapping = [];

        // 确保原始题目是按顺序的
        const sortedOriginal = originalQuestions.sort((a, b) => a.id - b.id);

        // 遍历原始题目，从第0题（即第1题）开始
        sortedOriginal.forEach((original, index) => {
            // 获取 AI 回复中对应 "index + 1" 位置的题目 (即 AI 的第二题开始)
            const aiMatched = sortedAIResults[index + 1]; // 关键偏移：+1

            if (aiMatched) {
                finalMapping.push({
                    originalNum: original.id,
                    aiNum: aiMatched.num,
                    answer: aiMatched.answer,
                    status: 'success'
                });
            } else {
                finalMapping.push({
                    originalNum: original.id,
                    status: 'missing'
                });
            }
        });

        // 4. 生成结果面板
        if (finalMapping.length > 0) {
            finalMapping.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'result-item';

                let statusText = '';
                let statusClass = '';

                if (item.status === 'success') {
                    statusText = `✓ AI题号[${item.aiNum}]`;
                    statusClass = 'match-status';
                } else {
                    statusText = '⚠️ 未找到答案';
                    statusClass = 'match-status';
                }

                itemDiv.innerHTML = `
                    <div class="q-header">
                        <span class="q-num">题 ${item.originalNum}</span>
                        <span class="${statusClass}">${statusText}</span>
                    </div>
                    ${item.status === 'success' ? `<div class="ai-answer">答案: ${item.answer}</div>` : ''}
                `;
                contentDiv.appendChild(itemDiv);
            });
        } else {
            contentDiv.innerHTML = `<p class="error">⚠️ 未识别到任何答案。</p>`;
        }

        // 5. 添加原始AI回复的折叠区域
        const toggleBtn = document.createElement('button');
        toggleBtn.style.marginTop = '15px';
        toggleBtn.style.background = '#e0e0e0';
        toggleBtn.style.border = 'none';
        toggleBtn.style.padding = '5px 10px';
        toggleBtn.style.borderRadius = '4px';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.innerText = '查看完整AI回复';
        const rawDiv = document.createElement('div');
        rawDiv.style.display = 'none';
        rawDiv.style.backgroundColor = '#f9f9f9';
        rawDiv.style.padding = '10px';
        rawDiv.style.borderRadius = '4px';
        rawDiv.style.marginTop = '10px';
        rawDiv.style.fontSize = '13px';
        rawDiv.innerHTML = aiResponse.replace(/\n/g, '<br>');
        toggleBtn.onclick = () => {
            rawDiv.style.display = rawDiv.style.display === 'none' ? 'block' : 'none';
            toggleBtn.innerText = rawDiv.style.display === 'none' ? '查看完整AI回复' : '收起完整回复';
        };
        contentDiv.appendChild(toggleBtn);
        contentDiv.appendChild(rawDiv);
    }

    // 启动逻辑
    function initWhenReady() {
        if (document.querySelector('.questionLi, .TiMu')) {
            initUI();
        } else if (document.readyState === 'complete') {
            setTimeout(initUI, 1000);
        } else {
            window.addEventListener('load', () => setTimeout(initUI, 1000));
        }
    }

    // 处理动态加载的题目
    const observer = new MutationObserver(initWhenReady);
    observer.observe(document.body, { childList: true, subtree: true });
    initWhenReady();
})();
