import tkinter as tk
from tkinter import ttk, messagebox, filedialog, simpledialog
import json
import os
import csv
import random

class AutoQuizApp:
    def __init__(self, root):
        self.root = root
        self.root.title("自动答题机制 v9.2 - 墨迹专属")
        self.root.geometry("900x700")
        self.root.minsize(800, 600)
        
        # 核心数据结构
        self.quiz_data = {}
        self.questions = []
        self.current_q_index = 0
        self.total_q_count = 0
        self.config_file = "quiz_config.json"
        self.is_answered = False
        
        self.setup_styles()
        self.create_widgets()
        self.load_config()

    def setup_styles(self):
        style = ttk.Style()
        style.theme_use('clam')
        style.configure("Title.TLabel", font=("Microsoft YaHei", 14, "bold"), foreground="#2c3e50")
        style.configure("TLabel", font=("Microsoft YaHei", 10))
        style.configure("Action.TButton", font=("Microsoft YaHei", 10, "bold"), padding=5)
        style.configure("Question.TLabel", font=("Microsoft YaHei", 16, "bold"), wraplength=600)
        style.configure("Option.TCheckbutton", font=("Microsoft YaHei", 13), padding=8)
        style.configure("Feedback.TLabel", font=("Microsoft YaHei", 12, "bold"), padding=10)

    def create_widgets(self):
        # 1. 顶部：开始答题区
        start_frame = ttk.Frame(self.root, padding=15)
        start_frame.pack(fill="x")
        
        ttk.Label(start_frame, text="答题数量:", font=("Microsoft YaHei", 11, "bold")).pack(side="left")
        self.q_count_entry = ttk.Entry(start_frame, width=6, font=("Microsoft YaHei", 11))
        self.q_count_entry.insert(0, "10")
        self.q_count_entry.pack(side="left", padx=5)
        
        self.shuffle_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(start_frame, text="打乱选项顺序", variable=self.shuffle_var).pack(side="left", padx=15)
        
        ttk.Button(start_frame, text="� 保存配置", style="Action.TButton", command=self.save_config).pack(side="right", padx=5)
        ttk.Button(start_frame, text="� 加载配置", style="Action.TButton", command=self.load_config).pack(side="right", padx=5)
        ttk.Button(start_frame, text="� 开始答题", style="Action.TButton", command=self.start_quiz).pack(side="right", padx=5)

        # 2. 中间：题库管理区 (左右分栏)
        mid_frame = ttk.Frame(self.root, padding=(15, 0))
        mid_frame.pack(fill="both", expand=True)
        
        # 左侧：文件夹与题组列表
        left_frame = ttk.LabelFrame(mid_frame, text="题库管理", padding=10)
        left_frame.pack(side="left", fill="both", expand=True, padx=(0, 5))
        
        btn_frame = ttk.Frame(left_frame)
        btn_frame.pack(fill="x", pady=(0, 5))
        ttk.Button(btn_frame, text="➕ 新建文件夹", style="Action.TButton", command=self.add_folder).pack(side="left", padx=2)
        ttk.Button(btn_frame, text="📄 添加题组", style="Action.TButton", command=self.add_group).pack(side="left", padx=2)
        ttk.Button(btn_frame, text="➖ 删除选中", style="Action.TButton", command=self.remove_item).pack(side="right", padx=2)
        
        self.tree = ttk.Treeview(left_frame, columns=("info",), show="tree", selectmode="browse")
        self.tree.heading("#0", text="文件夹 / 题组名称")
        self.tree.pack(fill="both", expand=True)
        
        # 右侧：答题面板
        right_frame = ttk.LabelFrame(mid_frame, text="答题区", padding=15)
        right_frame.pack(side="right", fill="both", expand=True, padx=(5, 0))
        
        self.q_label = ttk.Label(right_frame, text="请在左侧选择文件夹或题组，然后点击【开始答题】", style="Question.TLabel")
        self.q_label.pack(pady=(20, 30), anchor="w")
        
        self.options_check = []
        self.option_vars = []
        opt_frame = ttk.Frame(right_frame)
        opt_frame.pack(fill="x", pady=10)
        for i in range(4):
            var = tk.BooleanVar()
            cb = ttk.Checkbutton(opt_frame, variable=var, state="disabled", style="Option.TCheckbutton")
            cb.pack(anchor="w", pady=5)
            self.options_check.append(cb)
            self.option_vars.append(var)
            
        self.feedback_label = ttk.Label(right_frame, text="", style="Feedback.TLabel", wraplength=500, justify="center")
        self.feedback_label.pack(pady=20)
        
        btn_bottom_frame = ttk.Frame(right_frame)
        btn_bottom_frame.pack(pady=10)
        self.confirm_btn = ttk.Button(btn_bottom_frame, text="确认答案 (多选)", style="Action.TButton", command=self.confirm_multi_answer, state="disabled")
        self.confirm_btn.pack(side="left", padx=10)
        self.next_btn = ttk.Button(btn_bottom_frame, text="下一题", style="Action.TButton", command=self.next_question, state="disabled")
        self.next_btn.pack(side="left", padx=10)
        
        self.progress_label = ttk.Label(right_frame, text="进度: 0 / 0", font=("Microsoft YaHei", 10))
        self.progress_label.pack(side="bottom", pady=10)

    # ================= 数据管理方法 =================
    def add_folder(self):
        name = simpledialog.askstring("新建文件夹", "请输入文件夹名称:")
        if name and name not in self.quiz_data:
            self.quiz_data[name] = []
            self.refresh_tree()

    def add_group(self):
        selected = self.tree.selection()
        if not selected or 'folder' not in self.tree.item(selected[0])['tags']:
            messagebox.showwarning("提示", "请先在左侧选中一个【文件夹】！")
            return
        folder_name = self.tree.item(selected[0])['text']
        
        path = filedialog.askopenfilename(title="选择CSV题库", filetypes=[("CSV", "*.csv")])
        if not path: return
        
        name = simpledialog.askstring("添加题组", "请输入该题组名称:")
        if not name: return
        
        try:
            start = simpledialog.askinteger("行范围", "起始行号 (从1开始):")
            end = simpledialog.askinteger("行范围", "结束行号 (包含):")
            cols_str = simpledialog.askstring("列映射", "请输入题目,A,B,C,D,答案的列号(用英文逗号分隔,如 1,2,3,4,5,6):")
            cols = [int(c) for c in cols_str.split(",")]
        except: 
            messagebox.showerror("错误", "输入格式不正确！")
            return

        self.quiz_data[folder_name].append({
            "name": name, "path": path, "start": start, "end": end, "cols": cols
        })
        self.refresh_tree()

    def remove_item(self):
        selected = self.tree.selection()
        if not selected: return
        item = self.tree.item(selected[0])
        tags = item['tags']
        if 'folder' in tags:
            del self.quiz_data[item['text']]
        elif 'group' in tags and len(tags) >= 2:
            folder = tags[1]
            self.quiz_data[folder] = [g for g in self.quiz_data[folder] if g['name'] != item['text']]
        self.refresh_tree()

    def refresh_tree(self):
        for i in self.tree.get_children(): self.tree.delete(i)
        for folder, groups in self.quiz_data.items():
            fid = self.tree.insert("", "end", text=folder, tags=("folder",), open=True)
            for g in groups:
                self.tree.insert(fid, "end", text=g['name'], tags=("group", folder))

    def save_config(self):
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump({"quiz_data": self.quiz_data, "q_count": self.q_count_entry.get()}, f, ensure_ascii=False, indent=2)
            messagebox.showinfo("成功", "配置已保存！")
        except Exception as e: messagebox.showerror("保存失败", str(e))

    def load_config(self):
        if not os.path.exists(self.config_file): return
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.quiz_data = data.get("quiz_data", {})
            self.q_count_entry.delete(0, tk.END)
            self.q_count_entry.insert(0, data.get("q_count", "10"))
            self.refresh_tree()
        except Exception as e: messagebox.showerror("加载失败", str(e))

    # ================= 核心答题逻辑 =================
    def load_questions_from_groups(self, groups):
        loaded = []
        for g in groups:
            try:
                start_idx = g['start'] - 1
                end_idx = g['end']
                cols = [c - 1 for c in g['cols']]
                with open(g['path'], 'r', encoding='utf-8-sig') as f:
                    reader = list(csv.reader(f))
                    for row_idx in range(start_idx, min(end_idx, len(reader))):
                        row = reader[row_idx]
                        if len(row) > max(cols):
                            loaded.append({
                                'question': row[cols[0]], 'A': row[cols[1]], 'B': row[cols[2]],
                                'C': row[cols[3]], 'D': row[cols[4]], 'answer': row[cols[5]].strip().upper()
                            })
            except Exception as e: messagebox.showerror("读取错误", f"题组 [{g['name']}]: {e}")
        return loaded

    def start_quiz(self):
        selected = self.tree.selection()
        if not selected:
            messagebox.showwarning("提示", "请先在左侧选中一个【文件夹】或【题组】！")
            return
            
        item = self.tree.item(selected[0])
        tags = item['tags']
        target_groups = []
        
        if 'folder' in tags:
            target_groups = self.quiz_data.get(item['text'], [])
        elif 'group' in tags and len(tags) >= 2:
            folder, g_name = tags[1], item['text']
            target_groups = [g for g in self.quiz_data.get(folder, []) if g['name'] == g_name]
        else:
            messagebox.showwarning("提示", "请选择有效的【文件夹】或【题组】！")
            return

        if not target_groups:
            messagebox.showwarning("提示", "所选目标下没有可用的题组！")
            return

        self.questions = self.load_questions_from_groups(target_groups)
        if not self.questions:
            messagebox.showwarning("提示", "未加载到任何题目！")
            return

        try: q_count_input = int(self.q_count_entry.get())
        except ValueError: q_count_input = 10
        
        self.total_q_count = len(self.questions) if q_count_input == 0 else min(q_count_input, len(self.questions))
        random.shuffle(self.questions)
        self.questions = self.questions[:self.total_q_count]

        # ================== 选项混淆逻辑修复 (核心) ==================
        if self.shuffle_var.get():
            for q in self.questions:
                # 1. 保存选项内容和对应的原标签
                option_contents = [q['A'], q['B'], q['C'], q['D']]
                original_labels = ['A', 'B', 'C', 'D']
                
                # 2. 打包并打乱
                combined = list(zip(option_contents, original_labels))
                random.shuffle(combined)
                
                # 3. 将打乱后的选项内容赋给新的A、B、C、D
                q['A'] = combined[0][0]
                q['B'] = combined[1][0]
                q['C'] = combined[2][0]
                q['D'] = combined[3][0]
                
                # 4. 构建原标签到新标签的映射
                # 例如：如果原A现在在新B的位置（索引1），则 original_to_new['A'] = 'B'
                original_to_new = {}
                for new_idx in range(4):
                    original_label = combined[new_idx][1]  # 这个位置原来是哪个标签
                    new_label = chr(65 + new_idx)  # 新标签是A、B、C、D
                    original_to_new[original_label] = new_label
                
                # 5. 转换答案
                original_answer = q['answer'].replace(',', '').strip().upper()
                new_answer = []
                for ans_char in original_answer:
                    if ans_char in original_to_new:
                        new_answer.append(original_to_new[ans_char])
                
                # 6. 排序新答案（匹配多选题判定逻辑）
                q['answer'] = ''.join(sorted(new_answer))
        # ============================================================
        
        self.current_q_index = 0
        self.show_question()

    def show_question(self):
        for var in self.option_vars: var.set(False)
        self.is_answered = False
        self.feedback_label.config(text="")
        self.confirm_btn.config(state="disabled")
        self.next_btn.config(state="disabled")
        
        if self.current_q_index < self.total_q_count:
            q = self.questions[self.current_q_index]
            self.q_label.config(text=f"{self.current_q_index+1}. {q['question']}")
            
            # 更新选项文本
            for i, opt in enumerate(["A", "B", "C", "D"]):
                self.options_check[i].config(text=f"{opt}. {q[opt]}", state="normal")
            self.progress_label.config(text=f"进度: {self.current_q_index+1} / {self.total_q_count}")
            
            if len(q['answer']) > 1:
                self.confirm_btn.config(state="normal")
                for cb in self.options_check: cb.config(command=lambda: self.next_btn.config(state="disabled"))
            else:
                for i, cb in enumerate(self.options_check): cb.config(command=lambda idx=i: self.on_single_select(idx))
        else:
            self.q_label.config(text="🎉 答题结束！")
            self.progress_label.config(text="已完成所有题目")
            for cb in self.options_check: cb.config(state="disabled")

    def on_single_select(self, idx):
        if self.is_answered: return
        for i, var in enumerate(self.option_vars):
            var.set(i == idx)
        self.next_btn.config(state="normal")
        self.check_single_answer(idx)

    def check_single_answer(self, idx):
        q = self.questions[self.current_q_index]
        self.is_answered = True
        selected_letter = chr(65 + idx)
        for cb in self.options_check: cb.config(state="disabled")
        if selected_letter == q['answer']:
            self.feedback_label.config(text="✅ 回答正确！", foreground="green")
        else:
            self.feedback_label.config(text=f"❌ 回答错误！\n正确答案: {q['answer']}", foreground="red")

    def confirm_multi_answer(self):
        if self.is_answered: return
        selected_letters = [chr(65 + i) for i, var in enumerate(self.option_vars) if var.get()]
        if not selected_letters:
            messagebox.showwarning("提示", "请至少选择一个选项！")
            return
            
        q = self.questions[self.current_q_index]
        self.is_answered = True
        user_answer = ''.join(sorted(selected_letters))
        
        for cb in self.options_check: cb.config(state="disabled")
        self.confirm_btn.config(state="disabled")
        
        if user_answer == q['answer']:
            self.feedback_label.config(text="✅ 【多选题】 回答正确！", foreground="green")
        else:
            self.feedback_label.config(text=f"❌ 【多选题】 回答错误！\n正确答案: {q['answer']}", foreground="red")
        self.next_btn.config(state="normal")

    def next_question(self):
        self.current_q_index += 1
        self.show_question()

if __name__ == "__main__":
    root = tk.Tk()
    app = AutoQuizApp(root)
    root.mainloop()