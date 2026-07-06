# luogu-plus 开发约定

> 本文件进版本库，人与 agent 共享。每次开发必须遵守。

## Git 工作流（强制）

### 何时 commit
- **每个逻辑单元一个 commit**：完成一个独立功能 / bug 修复 / 重构后立即 commit。
- **不允许累积**：禁止把多个无关改动攒在一起 commit。
- **不允许悬空**：禁止"改完文件就走人"——交付前必须 commit。

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
1. 改代码（一个逻辑单元）
2. `npm run typecheck` 确认无类型错误
3. `git add <相关文件>`（只 add 相关文件，不用 `git add .`）
4. `git commit -m "..."`（hook 自动跑 typecheck）
5. 重复

## 分支策略
- 个人项目，默认在 `main` 开发。
- 大功能可开 `feat/<name>` 分支，完成后 merge 回 main。

## 构建与产物
- `npm run build`：tsc + vite build，产物到 `dist/`。
- `dist/` 已在 `.gitignore`，不进版本库。

## 项目记忆（agent 专用）
- `.workbuddy/memory/` 是 agent 的本地记忆，不进版本库。
- 每次开发完成后，往 `.workbuddy/memory/YYYY-MM-DD.md` 追加工作记录。
- 跨会话的关键决策往 `.workbuddy/memory/MEMORY.md` 写。
