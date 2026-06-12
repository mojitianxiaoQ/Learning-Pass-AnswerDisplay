// ==UserScript==
// @name        学习通获取题目原题
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  解决动态加载不显示问题，导出为结构化CSV。打开到全览界面就可以使用，适用于所有文本类题目，带有图片的一律忽略图片，若图片为选项可能出现问题。
// @author       云烁
// @match        *://mooc1.chaoxing.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --- 配置 ---
    const CONFIG = {
        targetSelector: '.fanyaMarking', // 监听这个区域的变化
        buttonId: 'exportBtnSuperStar',
        pollInterval: 1000
    };

    // --- 核心功能：提取题目 ---
    function extractQuestions() {
        const questions = [];
        const questionBlocks = document.querySelectorAll('.questionLi');

        if (questionBlocks.length === 0) {
            console.warn('未找到 .questionLi 元素，请确认是否已进入具体的作业答题页面。');
            return null;
        }

        questionBlocks.forEach((block, index) => {
            const typeElement = block.querySelector('.colorShallow');
            const titleElement = block.querySelector('.mark_name');
            const optionsElements = block.querySelectorAll('.answerBg');

            if (!titleElement || optionsElements.length === 0) return;

            // 1. 获取题型和题干
            let type = typeElement ? typeElement.textContent.trim() : '未知题型';
            let titleRaw = titleElement.textContent.trim();
            // 移除题型前缀 (如 "1. (单选题)" -> "1.")
            let title = titleRaw.replace(type, '').trim();

            // 2. 初始化选项
            let optionA = '', optionB = '', optionC = '', optionD = '', optionE = '';

            // 3. 格式化选项
            optionsElements.forEach((option, optIndex) => {
                // 提取选项文字，移除可能存在的A/B/C前缀和多余空格
                const text = option.textContent.trim().replace(/^[A-Z]\s*[:：]?\s*/, '').trim();

                switch (optIndex) {
                    case 0: optionA = text; break;
                    case 1: optionB = text; break;
                    case 2: optionC = text; break;
                    case 3: optionD = text; break;
                    case 4: optionE = text; break; // 防止有的题目有E选项
                }
            });

            // 4. 组合最终对象
            questions.push({
                题干: title,
                题型: type,
                A选项: optionA,
                B选项: optionB,
                C选项: optionC,
                D选项: optionD
            });
        });

        return questions;
    }

    // --- 导出CSV ---
    function exportToCSV() {
        const questions = extractQuestions();
        if (!questions || questions.length === 0) {
            alert('❌ 未找到题目数据！\n请确保你已进入包含题目的作业页面。');
            return;
        }

        // 1. 构建CSV头部
        let csvContent = "题干,题型,A选项,B选项,C选项,D选项\n";

        // 2. 填充数据
        questions.forEach(q => {
            // 转义引号并包裹在双引号中，防止内容中的逗号或换行符破坏格式
            const row = [
                q.题干,
                q.题型,
                q.A选项,
                q.B选项,
                q.C选项,
                q.D选项
            ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');

            csvContent += row + "\n";
        });

        // 3. 创建下载
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `作业题目_${new Date().getTime()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        alert(`✅ 成功导出 ${questions.length} 道题目！`);
    }

    // --- 按钮控制 ---
    function createExportButton() {
        if (document.getElementById(CONFIG.buttonId)) return;

        const btn = document.createElement('button');
        btn.id = CONFIG.buttonId;
        btn.innerHTML = '🚀 导出CSV';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '999999',
            padding: '12px 18px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            fontSize: '14px',
            fontWeight: 'bold'
        });

        btn.onmouseenter = () => btn.style.backgroundColor = '#45a049';
        btn.onmouseleave = () => btn.style.backgroundColor = '#4CAF50';

        btn.onclick = exportToCSV;
        document.body.appendChild(btn);
    }

    // --- 监听页面变化 (关键修复) ---
    function observeDOM() {
        const observer = new MutationObserver((mutationsList) => {
            for (let mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            // 如果新增的节点是题目容器或者包含题目容器
                            if (node.matches && node.matches(CONFIG.targetSelector)) {
                                setTimeout(createExportButton, 500); // 延迟一点确保渲染完成
                            }
                            if (node.querySelector && node.querySelector(CONFIG.targetSelector)) {
                                setTimeout(createExportButton, 500);
                            }
                        }
                    });
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // --- 初始化 ---
    function init() {
        createExportButton(); // 立即尝试
        observeDOM(); // 开启监听
        setInterval(createExportButton, CONFIG.pollInterval); // 轮询保险
    }

    // 页面加载或 DOMContentLoaded 后初始化
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
        document.addEventListener('DOMContentLoaded', init);
    }

})();