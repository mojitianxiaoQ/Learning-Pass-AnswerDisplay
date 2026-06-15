// ==UserScript==
// @name         棱镜-学习通助手
// @namespace    http://tampermonkey.net/
// @version      3.8.9
// @description  直接使用AI返回的题号匹配题目，支持一键自动填写、Shift+单击查看题干
// @author       云烁
// @match        *://mooc1.chaoxing.com/mooc-ans*
// @grant        GM_xmlhttpRequest
// @connect      api.deepseek.com
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        apiKey: '111111111111111111111111111111111111111111111111111111111', // 请替换为你的 DeepSeek API Key
        model: 'deepseek-chat'
    };

    let currentAnswerMapping = [];

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
        background: #e3f2fd; padding: 2px 8px; border-radius: 10px; font-weight: bold; color: #1565C0; cursor: pointer;
    }
    .q-num:hover { background: #bbdef5; }
    .ai-answer { color: #d32f2f; font-weight: bold; padding: 5px; background: #ffebee; border-radius: 4px; margin-top: 5px; }
    .match-status { font-size: 12px; color: #666; margin-top: 3px; }
    .loading { color: #999; font-style: italic; }
    .error { color: #d32f2f; }
    .auto-fill-btn { background: #ff9800; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-weight: bold; margin-top: 10px; width: 100%; }
    .auto-fill-btn:hover { background: #fb8c00; }
    .shift-hint { font-size: 11px; color: #999; text-align: center; margin-top: 5px; }
    `;

    function injectStyles() {
        if (!document.getElementById('ai-script-styles')) {
            const styleSheet = document.createElement("style");
            styleSheet.innerText = styles;
            styleSheet.id = 'ai-script-styles';
            document.head.appendChild(styleSheet);
        }
    }

    function initUI() {
        injectStyles();
        if (document.getElementById('ai-assist-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'ai-assist-btn';
        btn.innerText = '🔢 AI 智能匹配题号';
        btn.onclick = startProcessing;
        document.body.appendChild(btn);

        const panel = document.createElement('div');
        panel.id = 'ai-result-panel';
        panel.innerHTML = '<h3>📌 答案解析</h3><div id="ai-content">等待开始...</div>';
        document.body.appendChild(panel);
    }

    function findQuestionContainerByNumber(questionNum) {
        const containers = document.querySelectorAll('.singleQuesId, .TiMu');
        for (const container of containers) {
            const titleNum = container.querySelector('.Zy_TItle i.fl, .Zy_TItle .fl');
            if (titleNum && titleNum.innerText.trim() === String(questionNum)) {
                return container;
            }
        }
        return null;
    }

    function extractQuestionText(container) {
        const titleDiv = container.querySelector('.Zy_TItle .fontLabel, .Zy_TItle');
        if (!titleDiv) return '无法获取题干';
        const clone = titleDiv.cloneNode(true);
        clone.querySelectorAll('.newZy_TItle, span').forEach(el => el.remove());
        let text = clone.innerText.trim();
        text = text.replace(/\s+/g, ' ').trim();
        return text || '题干为空';
    }

    function showQuestionBody(questionNum) {
        const container = findQuestionContainerByNumber(questionNum);
        if (!container) {
            alert(`未找到题号 ${questionNum} 的题目容器`);
            return;
        }
        const questionText = extractQuestionText(container);
        alert(`📖 题号 ${questionNum} 的题干：\n\n${questionText}`);
    }

    // 文本规范化（忽略混淆字符）
    function normalizeText(text) {
        if (!text) return '';
        let normalized = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
        normalized = normalized.replace(/选择$/, '');
        return normalized;
    }

    function isTextSimilar(answer, optionText) {
        const normAnswer = normalizeText(answer);
        const normOption = normalizeText(optionText);
        if (normAnswer.length === 0 || normOption.length === 0) return false;
        return normOption.includes(normAnswer) || normAnswer.includes(normOption);
    }

    function fillAnswerToContainer(container, answerStr) {
        let answer = answerStr.trim();
        const options = container.querySelectorAll('.Zy_ulTop li');
        if (!options.length) return false;

        const optionInfo = [];
        for (const opt of options) {
            const letterSpan = opt.querySelector('.num_option');
            if (!letterSpan) continue;
            const letter = letterSpan.getAttribute('data') || letterSpan.innerText.trim();
            const optTextElem = opt.querySelector('a, p');
            const rawText = optTextElem ? optTextElem.innerText.trim() : opt.innerText.replace(letter, '').trim();
            const isSelected = opt.classList.contains('check_answer');
            optionInfo.push({ element: opt, letter: letter, rawText: rawText, isSelected: isSelected });
        }

        // 字母匹配
        if (/^[A-Z]+$/i.test(answer)) {
            const targetLetters = answer.toUpperCase().split('');
            for (const info of optionInfo) {
                const shouldBeSelected = targetLetters.includes(info.letter);
                if (shouldBeSelected && !info.isSelected) info.element.click();
                else if (!shouldBeSelected && info.isSelected) info.element.click();
            }
            return true;
        }

        // 文字匹配
        for (const info of optionInfo) {
            if (isTextSimilar(answer, info.rawText)) {
                if (!info.isSelected) info.element.click();
                return true;
            }
        }
        return false;
    }

    function autoFillAnswers() {
        if (!currentAnswerMapping || currentAnswerMapping.length === 0) {
            alert('没有可用的答案映射，请先点击"AI智能匹配题号"获取答案');
            return;
        }

        let successCount = 0, failCount = 0;
        for (const item of currentAnswerMapping) {
            if (item.status !== 'success' || !item.answer) {
                failCount++;
                continue;
            }
            const container = findQuestionContainerByNumber(item.originalNum);
            if (!container) {
                failCount++;
                continue;
            }
            try {
                if (fillAnswerToContainer(container, item.answer)) successCount++;
                else failCount++;
            } catch (err) {
                console.error(err);
                failCount++;
            }
        }
        alert(`自动填写完成！\n成功: ${successCount} 题\n失败: ${failCount} 题`);
    }

    async function startProcessing() {
        if (!CONFIG.apiKey || CONFIG.apiKey.includes('xxxx') || CONFIG.apiKey.length < 10) {
            alert('❌ 错误：请在脚本代码顶部的 CONFIG 区域填入有效的 DeepSeek API Key！');
            return;
        }
        const panel = document.getElementById('ai-result-panel');
        const contentDiv = document.getElementById('ai-content');
        panel.style.display = 'block';
        contentDiv.innerHTML = '<div class="loading">正在抓取题目原始内容...</div>';

        const rawQuestions = extractRawQuestions();
        if (rawQuestions.length === 0) {
            contentDiv.innerHTML = '<p class="error">未检测到题目，请刷新页面重试。</p>';
            return;
        }
        contentDiv.innerHTML = `<div class="loading">已获取 ${rawQuestions.length} 道题，正在发送给 AI...</div>`;

        try {
            const prompt = buildPrompt(rawQuestions);
            const aiResponse = await callDeepSeek(prompt);
            parseAndRenderResults(aiResponse, rawQuestions);
        } catch (error) {
            contentDiv.innerHTML = `<p class="error">❌ 请求失败: ${error.message}</p>`;
        }
    }

    function extractRawQuestions() {
        const questions = [];
        const containers = document.querySelectorAll('.questionLi, .TiMu, .work-cont');
        containers.forEach((container, index) => {
            let questionNumber = index + 1;
            const titleEl = container.querySelector('.Zy_TItle, .clearfix, .title-top');
            if (titleEl) {
                const titleText = titleEl.innerText;
                const numMatch = titleText.match(/^\s*(\d+)[\.、\s]/);
                if (numMatch) questionNumber = parseInt(numMatch[1]);
            }
            const clone = container.cloneNode(true);
            clone.querySelectorAll('.btn, .note, .collect, .fr, .Zy_Ul, .mark').forEach(el => el.remove());
            const fullText = clone.innerText.trim().replace(/\n{3,}/g, '\n\n');
            if (fullText.length > 10) questions.push({ id: questionNumber, rawText: fullText });
        });
        return questions.sort((a, b) => a.id - b.id);
    }

    function buildPrompt(questions) {
        let prompt = `你是一个考试助手，请严格按以下规则回答：\n\n`;
        prompt += `**核心规则**\n`;
        prompt += `1. 必须为每道题单独回复，格式：\n "[题号]. [答案]"\n`;
        prompt += `2. 题号必须使用我提供的原始题号（1、2、3...）\n`;
        prompt += `3. 答案内容：\n`;
        prompt += ` - 选择题：仅输出选项字母（如 "A"、"BC"）\n`;
        prompt += ` - 判断题：输出"对"或"错"\n`;
        prompt += ` - 简答题：输出关键答案短语（不超过20字）\n`;
        prompt += `4. 禁止任何解释、分析或额外文字\n\n`;
        prompt += `**题目列表**\n`;
        questions.forEach(q => { prompt += `--- [${q.id}] ---\n${q.rawText}\n\n`; });
        prompt += `**开始回复**\n`;
        return prompt;
    }

    function callDeepSeek(prompt) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: "https://api.deepseek.com/v1/chat/completions",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${CONFIG.apiKey}` },
                data: JSON.stringify({
                    model: CONFIG.model,
                    messages: [
                        { role: "system", content: "你是一个严格的答题机器，必须100%遵守用户的格式要求。任何解释都会导致任务失败。" },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.0
                }),
                onload: function(response) {
                    try {
                        const json = JSON.parse(response.responseText);
                        if (json.choices?.[0]?.message?.content) resolve(json.choices[0].message.content);
                        else reject(new Error("API 返回无有效内容"));
                    } catch (e) { reject(new Error("JSON解析失败: " + e.message)); }
                },
                onerror: function(err) { reject(new Error("网络错误: " + err.status)); }
            });
        });
    }

    // 关键修改：直接根据AI返回的题号匹配，不做偏移
    function parseAndRenderResults(aiResponse, originalQuestions) {
        const contentDiv = document.getElementById('ai-content');
        contentDiv.innerHTML = '';

        // 1. 解析AI回复中的题号和答案
        const aiResults = [];
        const lines = aiResponse.split('\n').filter(line => line.trim());
        const pattern = /^\s*\[?(\d+)\]?\s*[\.\:、]\s*([A-Z0-9\u4e00-\u9fa5]+[A-Z0-9\u4e00-\u9fa5\s]*)/i;
        lines.forEach(line => {
            const match = line.match(pattern);
            if (match) {
                aiResults.push({
                    num: parseInt(match[1]),
                    answer: match[2].trim()
                });
            }
        });

        // 2. 构建映射：遍历原始题目，根据题号在AI结果中查找匹配
        const finalMapping = [];
        const sortedOriginal = originalQuestions.sort((a, b) => a.id - b.id);

        for (const original of sortedOriginal) {
            const matched = aiResults.find(ai => ai.num === original.id);
            if (matched) {
                finalMapping.push({
                    originalNum: original.id,
                    aiNum: matched.num,
                    answer: matched.answer,
                    status: 'success'
                });
            } else {
                finalMapping.push({
                    originalNum: original.id,
                    status: 'missing'
                });
            }
        }

        // 存储到全局变量供自动填写使用
        currentAnswerMapping = finalMapping;

        // 3. 渲染结果面板
        if (finalMapping.length > 0) {
            finalMapping.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'result-item';
                const statusText = item.status === 'success' ? `✓ 匹配成功` : '⚠️ 未找到答案';
                itemDiv.innerHTML = `
                    <div class="q-header">
                        <span class="q-num" data-original-num="${item.originalNum}">题 ${item.originalNum}</span>
                        <span class="match-status">${statusText}</span>
                    </div>
                    ${item.status === 'success' ? `<div class="ai-answer">答案: ${item.answer}</div>` : ''}
                `;
                contentDiv.appendChild(itemDiv);
            });
        } else {
            contentDiv.innerHTML = `<p class="error">⚠️ 未识别到任何答案。</p>`;
        }

        // 4. 添加自动填写按钮
        const autoFillBtn = document.createElement('button');
        autoFillBtn.className = 'auto-fill-btn';
        autoFillBtn.innerText = '✍️ 一键自动填写答案';
        autoFillBtn.onclick = autoFillAnswers;
        contentDiv.appendChild(autoFillBtn);

        // 5. 提示
        const hintDiv = document.createElement('div');
        hintDiv.className = 'shift-hint';
        hintDiv.innerText = '💡 提示：按住 Shift 并单击题号可查看题干';
        contentDiv.appendChild(hintDiv);

        // 6. 原始AI回复折叠区域
        const toggleBtn = document.createElement('button');
        toggleBtn.style.cssText = 'margin-top:15px;background:#e0e0e0;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;';
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

        // 7. 绑定Shift+单击查看题干
        document.querySelectorAll('#ai-content .q-num').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.shiftKey) {
                    e.preventDefault();
                    const originalNum = parseInt(el.getAttribute('data-original-num'));
                    if (originalNum) showQuestionBody(originalNum);
                }
            });
        });
    }

    function initWhenReady() {
        if (document.querySelector('.questionLi, .TiMu')) initUI();
        else if (document.readyState === 'complete') setTimeout(initUI, 1000);
        else window.addEventListener('load', () => setTimeout(initUI, 1000));
    }

    const observer = new MutationObserver(initWhenReady);
    observer.observe(document.body, { childList: true, subtree: true });
    initWhenReady();
})();