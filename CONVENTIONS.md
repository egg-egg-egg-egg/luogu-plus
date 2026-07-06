# luogu-plus 开发约定

> 本文件进版本库，人与 agent 共享。每次开发必须遵守。

## Git 工作流（强制）

### 何时 commit
- **每个逻辑单元一个 commit**：完成一个独立功能 / bug 修复 / 重构后立即 commit。
- **不允许累积**：禁止把多个无关改动攒在一起 commit。
- **不允许悬空**：禁止"改完文件就走人"——交付前必须 commit。

### 交付前强制检查清单（MUST）

每次向用户交付任务结果前，**必须逐项确认**：

- [ ] `npm run typecheck` 通过（无类型错误）
- [ ] `git status --porcelain` 为空 = 所有改动已 commit，工作区干净
- [ ] 所有 commit message 符合 Conventional Commits 规范
- [ ] 当日工作已写入 `.workbuddy/memory/YYYY-MM-DD.md`

**如果 `git status --porcelain` 不为空 → 有未提交改动，先 commit 再交付。**
违反此检查清单 = 流程违规，用户有权拒绝交付结果。

### commit 前置校验
- 必须通过 `npm run typecheck`（pre-commit hook 自动跑）。
- typecheck 失败 → 先修，再 commit。
- 禁止用 `--no-verify` 跳过 hook。

### commit message 规范
Conventional Commits 中文风格：

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | bug 修复 |
| `refactor` | 重构（不改行为） |
| `docs` | 文档变更 |
| `chore` | 构建 / 配置 / 依赖 |
| `style` | 格式调整（不改逻辑） |
| `test` | 测试 |
| `perf` | 性能优化 |

格式：`<type>(<scope>): <简述>` + 空行 + 详细说明（可选）

scope 示例：`content` / `background` / `db` / `ui` / `popup` / `lib`

### 标准开发流程
1. **开分支**：`git checkout -b feat/<name>`（功能）或 `git checkout -b fix/<name>`（修复 / debug）
2. 改代码（一个逻辑单元）
3. `npm run typecheck` 确认无类型错误
4. `git add <相关文件>`（只 add 相关文件，不用 `git add .`）
5. `git commit -m "..."`（hook 自动跑 typecheck）
6. 重复 2-5，直到功能完成
7. merge 回 `main`，删除临时分支

## 分支策略（强制）
- **禁止直接在 `main` 改代码。** 任何开发必须先开分支。
- 新功能：`feat/<name>` 分支。
- Bug 修复 / Debug：`fix/<name>` 分支（**强制**，debug 不开分支 = 违规）。
- 草案 / 实验：`exp/<name>` 分支。
- 完成并验证后 merge 回 `main`，删除临时分支。

## 构建与产物
- `npm run build`：tsc + vite build，产物到 `dist/`。
- `dist/` 已在 `.gitignore`，不进版本库。

## 项目记忆（agent 专用）
- `.workbuddy/memory/` 是 agent 的本地记忆，不进版本库。
- 每次开发完成后，往 `.workbuddy/memory/YYYY-MM-DD.md` 追加工作记录。
- 跨会话的关键决策往 `.workbuddy/memory/MEMORY.md` 写。
