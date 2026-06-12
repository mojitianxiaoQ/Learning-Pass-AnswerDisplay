// ==UserScript==
// @name         学习通获取原题+答案
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  提取题目、选项及正确答案。导出格式：题号、题型、题干、选项A、选项B、选项C、选项D、正确答案。需要打开到答题完成后的界面才可以使用，如果老师禁止答题之后查看答案则完全不可用。
// @author       云烁
// @match        *mooc1.chaoxing.com/mooc-ans/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    window.addEventListener('load', function() {
        addExportButton();
    });

    function addExportButton() {
        if (document.getElementById('exportCsvBtn')) return;

        let btn = document.createElement('button');
        btn.id = 'exportCsvBtn';
        btn.style.position = 'fixed';
        btn.style.top = '10px';
        btn.style.right = '10px';
        btn.style.zIndex = '999999';
        btn.style.padding = '10px 15px';
        btn.style.backgroundColor = '#009966';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.cursor = 'pointer';
        btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
        btn.textContent = '导出题目 (分列CSV)';

        btn.addEventListener('click', exportToCsv);
        document.body.appendChild(btn);
    }

    function exportToCsv() {
        let data = [];
        let questionBlocks = document.querySelectorAll('.mark_item');

        questionBlocks.forEach(block => {
            let questions = block.querySelectorAll('.questionLi');
            let typeNameText = block.querySelector('.type_tit')?.textContent || '未知题型';
            let cleanType = typeNameText.replace(/^[^、]*、|[\d\.\s\（\）\(\)]/g, '').trim();

            questions.forEach(q => {
                let result = extractQuestionData(q, cleanType);
                if (result) data.push(result);
            });
        });

        if (data.length === 0) {
            alert('未找到题目数据！');
            return;
        }

        // --- CSV 头部定义 ---
        let csvContent = "题号,题型,题干,选项A,选项B,选项C,选项D,正确答案\n";

        data.forEach(row => {
            // 转义引号并包裹字段
            let escapedRow = row.map(field => `"${(field || '').toString().replace(/"/g, '""')}"`);
            csvContent += escapedRow.join(",") + "\n";
        });

        // 触发下载
        let blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        let url = URL.createObjectURL(blob);
        let link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `作业题目_${new Date().toLocaleDateString()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert(`成功导出 ${data.length} 道题目！`);
    }

    function extractQuestionData(questionElement, defaultType) {
        try {
            let titleElement = questionElement.querySelector('.mark_name');
            if (!titleElement) return null;

            let titleText = titleElement.textContent.trim();

            // 1. 提取题号
            let numMatch = titleText.match(/^(\d+)\./);
            let number = numMatch ? numMatch[1] : '未知';

            // 2. 提取题型
            let typeElement = questionElement.querySelector('.colorShallow');
            let typeText = typeElement ? typeElement.textContent.trim() : defaultType;

            // 3. 提取题干 (去除题号和题型)
            // 正则解释：匹配开头的数字+点，以及中间的 (题型) 部分
            let stem = titleText.replace(/^.*?\d+\.\s*$$[^)]+$$\s*/, '').trim();

            // 4. 提取选项 (A, B, C, D)
            // 初始化四个选项为空
            let optA = '', optB = '', optC = '', optD = '';
            let optionElements = questionElement.querySelectorAll('.qtDetail li');

            // 遍历选项，最多取4个
            optionElements.forEach((opt, index) => {
                if (index >= 4) return; // 超过4个选项丢弃
                let optText = opt.textContent.trim();
                // 去除 "A. "、"B. " 这样的前缀
                optText = optText.replace(/^[A-Z]\.\s*/, '').trim();

                if (index === 0) optA = optText;
                if (index === 1) optB = optText;
                if (index === 2) optC = optText;
                if (index === 3) optD = optText;
            });

            // 5. 提取正确答案
            let answerElement = questionElement.querySelector('.rightAnswerContent');
            let correctAnswer = '';

            if (answerElement) {
                correctAnswer = answerElement.textContent.trim();
                // 如果答案是 "对" 或 "错" (判断题)，保持原样
                // 如果答案是字母 (如 A, B, ABCD)，也保持原样
            }

            return [number, typeText, stem, optA, optB, optC, optD, correctAnswer];
        } catch (e) {
            console.error('处理题目出错:', e);
            return null;
        }
    }
})();
