# Composer 执行单 · `fix/quality-audit-20260923` 合入 main 前的收尾

发单人：Min（项目负责人）
执行者：Composer（代码 Agent）
分支：`fix/quality-audit-20260923` @ `2ecb010`（已推送到 origin）
目标基线：`origin/main` @ `a3e7a5f`（PR #6 之后）
依据：Claude 对 `2ecb010` 的代码审查结论（2026-09-23）

**定位**：`2ecb010` 的改动本身已审查通过（API/Web `tsc` 全绿，`pnpm test:api:isolated` 86/86 通过）。问题只有一个：分支基点是 `c4a7331`，落后 `origin/main` 14 个提交（PR #1–#6），直接合并会在 9 个文件冲突，其中审批策略和决策服务是**语义冲突**。本单只做"把 main 合进分支、解冲突、跑绿、开 PR"，不做任何新功能。

---

## 0. 硬性约束（先读，违反任何一条即停止并汇报）

1. 在现有分支 `fix/quality-audit-20260923` 上操作，用 **`git merge origin/main`** 生成一个合并提交。**不要 rebase、不要 force push**（`2ecb010` 已经在远端）。
2. 工作区里现有的三个删除（`design/v2/implementation.html`、`design/v2/screens/A01.png`、`design/v2/screens/C01.png`）**不是本次改动的一部分**。解冲突后只 `git add` 本单点名的文件，**禁止 `git add -A` / `git add .` / `git commit -a`**。提交前用 `git status --short` 确认这三个 `D` 仍然停留在未暂存区。
3. 不要碰 `design/`、`docs/tasks/*.pdf`、`apps/api/prisma/migrations/` 里已有的迁移；本单不需要任何 schema 变更。
4. 不要改 demo 账号、`project721` 密码、品牌文案（`SITE_NAME`、`LEGAL_ENTITY`、`packages/ui/src/Logo.tsx`）。`apps/web/test/brand-copy.test.mjs` 会检查。
5. 金额仍然只用字符串 + `apps/api/src/lending/money.ts` 的 cents 工具；不要在前端引入 `Number.parseFloat` 处理金额（main 的 `staff.tsx` 已经把这段删了，见 3-H）。
6. **不要**连接 Railway 演示库、不要跑 `prisma migrate deploy`、不要读或改 Railway 环境变量。所有 API 测试只能通过 `pnpm test:api:isolated`（它自己起一次性 PostgreSQL 集群）。**不要**运行 `pnpm test:api`（会 fail-closed 报错，这是预期行为）和 `pnpm test:e2e`（连本地 `.env` 库，不隔离）。
7. 开 PR 后**不要**等待或轮询 GitHub Actions（本仓库目前也没有 workflow）。本地验证全绿即可。
8. **不要合并 PR**。开好 PR、贴上验证结果后停止，由 Min 合并。
9. 不新增 markdown 文档（本单除外，已经存在）、不重写 README 全文；README 只按 3-I 解冲突。
10. 每一步验证红了且 15 分钟内修不好：不要绕过（不要 skip 测试、不要 `// @ts-ignore`），在汇报里标 `BLOCKED` 并附完整错误输出，停止。

### 环境（macOS + zsh，本机）

```bash
cd "/Users/minchen/Desktop/721项目"
git fetch origin
git switch fix/quality-audit-20260923
git status --short          # 应只看到上面三个 design/ 的 D
node -v                     # >= 22.12
ls /opt/homebrew/opt/postgresql@16/bin/initdb   # 隔离测试运行器依赖
```

### 验证命令（第 4 步全部要跑）

```bash
pnpm --filter @toumua/contracts build
pnpm typecheck                                  # main 新增的根脚本，覆盖 api + web
pnpm test:api:isolated
pnpm --filter @toumua/web test                  # brand-copy / landing-cta
pnpm --filter @toumua/web build
node --experimental-strip-types scripts/test-auckland-date.mjs
pnpm test:web:ui
```

---

## 1. 决策原则（解冲突时统一按这个来）

两边都在做"只有 Manager 能批"，取向如下：

| 主题 | 采用 | 理由 |
|---|---|---|
| 审批策略 API 形状 | **分支侧**：`classifyApproval()` 返回 `{ complex, reasons }`；删除 `staffApproveLimit()`、`STAFF_APPROVE_LIMIT` env、`DEFAULT_STAFF_APPROVE_LIMIT` | 分支方案更干净；Profile 明确没有"员工额度"，不需要 opt-in 开关 |
| 决策权限 | **分支侧**：`decide()` 用 `assertDecideApplication`；`review()` 返回 `canApprove`、`canDecline`、`managerReasons`、`requiresManager: true` | 覆盖 approve 和 decline 两个动作 |
| 估值覆盖字段 | **main 侧**：`review()` 的 `assets[].valuationAmount`、`valuationTotal`；审批快照里的 `valuationAmount` cents | PR #6 的估值覆盖率校验依赖它们，必须保留 |
| 前端 `/staff/applications/:id/edit/review` 提示文案 | **分支侧**文案 + **main 侧** `officerView` 结构 | main 已按角色分视图；分支删掉了 `staffApproveLimit` 展示 |
| 客户自助申请 feature flag（`CUSTOMER_SELF_APPLY`） | **main 侧** | PR #5 Phase 1 的成果，分支没碰这块 |
| Staff 首页统计 | **main 侧**（服务端 `/reports/business-status`，`aucklandDay()` 已在服务端处理时区） | 分支里前端本地算 `dueToday` 的代码在 main 已被整段删除 |
| 日期/时区工具、`useAsyncResource`、`NotificationsShell`、幂等键身份绑定、修正单守卫、测试隔离 | **分支侧**全部保留 | 这是本分支的核心交付，main 没有对应改动 |
| README | 两边合并：main 的完整账号列表 + 分支的测试说明 | 见 3-I |

---

## 2. 执行 merge

```bash
git merge origin/main --no-ff
```

预期输出 9 个 `CONFLICT (content)`：

- `README.md`
- `apps/api/src/lending/approval-policy.ts`
- `apps/api/src/lending/decisions.service.ts`
- `apps/api/test/batch04.spec.ts`
- `apps/api/test/unit.spec.ts`
- `apps/web/src/pages/batch04.tsx`
- `apps/web/src/pages/lending.tsx`
- `apps/web/src/pages/loans.tsx`
- `apps/web/src/pages/staff.tsx`

如果冲突文件集合与上面不一致，先停下来汇报再继续。

---

## 3. 逐文件解冲突

标记里 `HEAD` = 本分支（`2ecb010`），`origin/main` = main。

### 3-A `apps/api/src/lending/approval-policy.ts`

- 文件头：**取 HEAD**（分支的 docblock），删掉 main 的 `import { compare, fromCents, toCents }` 和整个 `staffApproveLimit()` 函数。
- `return` 块：**取 HEAD** `complex: reasons.length > 0`；删掉 main 的 `limit` 和 `requiresManager: officersNeverApprove || ...`。
- 确认 main 加的 `const officersNeverApprove = compare(limit, "0.00") === 0;` 和 `reasons.unshift("Approval is a manager decision");` 两行也一并删除（它们可能不在冲突标记内，但依赖被删的 `limit`）。
- 解完后 `rg -n "staffApproveLimit|limit|requiresManager|compare" apps/api/src/lending/approval-policy.ts` 应无结果。

### 3-B `apps/api/src/lending/decisions.service.ts`

- 顶部 import：保留 main 新增的 `ValuationStatus`、`import { sum, toCents } from "./money"`、`import { buildReadiness } from "./readiness"`；保留分支的 `assertDecideApplication`。删掉 `isReadyToSubmit`（main 已删）。
- `review()` 第一个冲突：**两边都要**。保留 main 的 `const assets = application.assets.map(...)`（带 `valuationAmount`），保留分支的
  ```ts
  const manager = isManager(user);
  const submitted = application.status === ApplicationStatus.SUBMITTED;
  const canApprove = submitted && ready && manager;
  const canDecline = submitted && manager;
  ```
  删掉 main 的 `const canApprove = ready && (isManager(user) || !routing.requiresManager);`。
- `review()` 返回对象第二个冲突：用 main 的 `assets,` 和 `valuationTotal: sum(...)`，用分支的 `managerReasons: routing.reasons`、`requiresManager: true`、`canApprove`、`canDecline`、`allowedActions: this.allowedActions(application, checks, user)`。删掉 main 的 `staffApproveLimit: routing.limit` 和 `requiresManager: routing.requiresManager`。
- `allowedActions()` 里 approve 的 reason 文案冲突：**取 HEAD** `"Only a manager can approve an application"`。
- 保留 main 在审批快照里加的 `valuationAmount: ... ? toCents(...) : 0`（不在冲突标记内，不要动）。
- 确认 `decide()` 里 `assertDecideApplication(user)` 在，且不存在 `routing.requiresManager && !isManager(user)` 的旧判断。
- `routingOf()` 仍然被 `review()` 用来产生 `managerReasons`，保留。

### 3-C `apps/api/test/unit.spec.ts`

- `describe("approval routing")`：**取 HEAD** 的单个用例（`.complex` 断言，无 env 操作）。删掉 main 的 `previousLimit` / `afterEach` / `STAFF_APPROVE_LIMIT` 两个用例。
- 解完后 `rg -n "STAFF_APPROVE_LIMIT|requiresManager" apps/api/test/unit.spec.ts` 应无结果。

### 3-D `apps/api/test/batch04.spec.ts`

目标：**以分支的 B04-09 为骨架**（同时验证 small/large 两个文件、approve 和 decline 两个动作对 loan officer 都是 403，manager 都可以），**并加进 main 的估值断言**。

- 用例名取 HEAD：`"B04-09 only a manager can approve or decline, for small and large files"`。
- 在 loan officer 的 `staffReview` 断言处，保留 HEAD 的 `canApprove false`、`canDecline false`，并**加上** main 的
  ```ts
  expect(staffReview.body.valuationTotal).toBe("600.00");
  expect(staffReview.body.assets[0].valuationAmount).toBe("600.00");
  ```
  注意变量名对齐：分支用 `small.appId` / `large.appId`，main 用 `appId`；以分支为准。如果 `"600.00"` 与分支 fixture 里的估值金额不一致，改成分支 fixture 实际的金额（先 `rg -n "600\.00|amount:" apps/api/test/batch04.spec.ts` 看清楚），**不要**反过来改 fixture。
- 删掉 `expect(staffReview.body.requiresManager).toBe(true)`（该字段现在恒为 `true`，断言无意义；如果保留也不会挂，可留可删）。
- 后半段 manager 流程取 HEAD（manager 对 small 可 approve/decline，对 large 可 approve）。
- 解完后确认文件内没有残留的 `<<<<<<<` / `>>>>>>>`，且没有 main 版本里的重复 `const manager = await login(...)`。

### 3-E `apps/web/src/pages/batch04.tsx`

- 顶部 import：**三个都保留**：
  ```ts
  import { aucklandBusinessDate } from "../format";
  import { ResourceGate, useAsyncResource } from "../load-state";
  import { useAuth } from "../auth";
  ```
- `Review` 类型：删掉 `requiresManager?: boolean`（分支已删 `staffApproveLimit`，这个字段现在恒为 true 不再用于渲染）；保留分支的 `canDecline: boolean`。如果 main 在这个类型里加了 `valuationTotal` / `assets[].valuationAmount`，保留。
- 审批页提示文案冲突（约 L676–694）：保留 main 的 `officerView ? (...) : (...)` 结构，但把 manager 分支的内容换成 HEAD 的单段：
  ```tsx
  {officerView ? (
    <p className="hint">Approval is a manager decision. Submit the file for manager review.</p>
  ) : (
    <p className="hint">
      A manager decides every application.
      {review.managerReasons?.length ? ` ${review.managerReasons.join(" ")}` : ""}
    </p>
  )}
  ```
  删掉所有 `review.staffApproveLimit` / `review.requiresManager` 引用。
- Approve/Decline 按钮：保留分支的 `disabled={!review.canDecline || !reason.trim()}`；main 的 `officerView ? null : (...)` 包裹保留。
- 解完后 `rg -n "staffApproveLimit|requiresManager" apps/web/src` 应无结果。

### 3-F `apps/web/src/pages/lending.tsx`

- import 冲突：**两边都要**：
  ```ts
  import { CUSTOMER_SELF_APPLY } from "../features";
  import { aucklandBusinessDate, aucklandDateTimeLocal, aucklandWallTimeToIso } from "../format";
  ```
  `aucklandDate` 若文件里已无其他调用则不要再导入（分支把 `ValuationPage` 的初值换成了 `aucklandBusinessDate()`）。用 `rg -n "aucklandDate\(" apps/web/src/pages/lending.tsx` 确认。
- 保证 `ValuationPage` 里 `participatedAt: aucklandWallTimeToIso(participatedAt)` 是分支版本（不是 `new Date(participatedAt).toISOString()`）。

### 3-G `apps/web/src/pages/loans.tsx`

第一个产品的 `points` 数组，合并为：

```ts
CUSTOMER_SELF_APPLY
  ? "Apply online with the amount you need and the security you can offer."
  : "Contact our office to apply. A loan officer completes the application with you.",
"Staff review the file and value the security; a manager makes every decision.",
```

第二个产品里分支把 `"Complex files — including an “Other” purpose — require a manager decision."` 改成了 `"A manager decides every application; complex files — including an “Other” purpose — get extra review."`，如果没冲突就保留分支版本。

### 3-H `apps/web/src/pages/staff.tsx`

- 冲突块：**取 origin/main**（三个 `useEffect`）。删掉分支的 `outstanding` / `dueToday` 本地计算（main 已改为服务端 `/reports/business-status`，且这段用了 `Number.parseFloat` 处理金额）。
- 顶部 import 去掉 `isDueOnAucklandToday`（`format.ts` 里的函数本身保留，`tests/e2e/ui/dates.spec.ts` 和 `scripts/test-auckland-date.mjs` 还在用）。
- 解完后 `pnpm typecheck` 不应报 `loans` 未定义之类的错误；如果报了，说明还残留分支侧的代码，继续清。

### 3-I `README.md`

- Demo 登录列表：**取 origin/main**（8 个账号的完整列表）。只把 Staff 和 Manager 两行的描述换成分支版本：
  - Staff：`prepares applications and valuations; a manager decides every approve/decline`
  - Manager：`decides applications, defaults, corrections and staff accounts`
- `## Test` 一节：**取 HEAD**（隔离测试说明）。
- 其他 main 新增段落（如果有）保留。

### 3-J 非冲突但必须一起改

- 根 `package.json`：`"test"` 脚本目前是 `pnpm --filter @toumua/api test && pnpm --filter @toumua/e2e test`，合并后 `pnpm --filter @toumua/api test` 会 fail-closed。改为：
  ```json
  "test": "pnpm test:api:isolated && pnpm --filter @toumua/web test",
  ```
  （去掉 e2e：它连本地 `.env` 库，不属于隔离检查；README 里已经这么说明了。）
- 全仓 `rg -n "STAFF_APPROVE_LIMIT" --glob '!node_modules' --glob '!dist' .`：除了 `docs/tasks/GROK-EXECUTION-SHEET.md`（历史记录，不改）之外应无结果。若 `.env.example` 里有这个变量，删掉那一行。

---

## 4. 验证

按顺序跑"验证命令"里的 7 条，全部退出码为 0。特别关注：

- `pnpm test:api:isolated`：应至少与合并前持平（分支 86 个 + main 新增的用例）。B04-09 必须通过。
- `pnpm --filter @toumua/web test`：brand-copy 与 landing-cta 不能因 3-G 的文案改动而失败。
- `pnpm test:web:ui`：分支新增的 `tests/e2e/ui/*.spec.ts` 依赖 `data-shell="staff|customer"` 和 `/staff/notifications` 路由，合并后不能丢。

任一项红：见约束 10。

---

## 5. 提交与 PR

```bash
git status --short                         # 确认 design/ 三个 D 仍未暂存
git add README.md package.json \
  docs/tasks/COMPOSER-EXECUTION-SHEET-quality-audit-merge.md \
  apps/api/src/lending/approval-policy.ts apps/api/src/lending/decisions.service.ts \
  apps/api/test/batch04.spec.ts apps/api/test/unit.spec.ts \
  apps/web/src/pages/batch04.tsx apps/web/src/pages/lending.tsx \
  apps/web/src/pages/loans.tsx apps/web/src/pages/staff.tsx
# 3-J 若改了 .env.example 也一并 add；其他 merge 自动解决的文件 git 已暂存
git commit -m "Merge origin/main into fix/quality-audit-20260923

Resolve approval-policy and decisions.service in favour of the audit branch
(manager-only approve/decline, no staff monetary limit) while keeping the
valuation coverage fields from #6. Staff home stats stay server-side."
git push origin fix/quality-audit-20260923
gh pr create --base main --head fix/quality-audit-20260923 \
  --title "Fix audited lending workflows and add isolated regression tests" \
  --body-file /tmp/pr-body.md
```

`/tmp/pr-body.md` 内容：一段说明（幂等键绑定身份、修正单守卫、测试隔离、前端加载态/时区/通知路由），一段"与 main 的冲突解法"（引用本单第 1 节的表），一段验证命令及结果。写完 PR 后把 `/tmp/pr-body.md` 删掉。

**不要合并。**

---

## 6. 汇报格式

```
分支：fix/quality-audit-20260923
合并提交：<sha>
PR：<url>

冲突文件（9）：全部按执行单第 3 节解决 / 偏离处：<说明>
残留检查：rg staffApproveLimit|requiresManager|STAFF_APPROVE_LIMIT → <结果>

验证：
  contracts build     ✓/✗
  typecheck           ✓/✗
  test:api:isolated   ✓ N passed / ✗ <失败用例>
  web test            ✓/✗
  web build           ✓/✗
  test-auckland-date  ✓/✗
  test:web:ui         ✓ N passed / ✗

工作区：design/ 三个删除仍未暂存 ✓
BLOCKED：无 / <条目>
```

---

## 附：不在本单范围（记录给 Min，不要做）

- `scripts/test-api-isolated.mjs` 硬编码 `/tmp` 和 Homebrew `postgresql@16` 路径，Windows 上跑不了。main 的 Phase 5 做过 Windows 兼容（`cross-env`/`shx`），后续可以单独开一单对齐。
- `docs/tasks/GROK-EXECUTION-SHEET.md` 里对 `STAFF_APPROVE_LIMIT` 的描述已过时，属于历史记录，不改。
