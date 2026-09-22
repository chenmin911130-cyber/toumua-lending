# Grok 执行单 · Profile 对齐 + Demo 可靠性

发单人：Min（项目负责人）
执行者：Grok（代码 Agent）
基线：`main` @ `0c2a8e1`（2026-09-22）
依据：`COMP720-721-Project-Profile.pdf`（客户需求）、`docs/tasks/COMP721-Demo-Logins.pdf`、本仓库代码审查结论

**定位**：这是 COMP721 课程作业，系统只用于课堂演示与评分，不上线服务真实客户。所有账号、密码（`project721`）、电话、地址均为演示数据。因此本单的目标是两件事：(1) 演示行为与 Profile 一致，让评分人看到"客户说的就是我们做的"；(2) 演示过程不崩、每个登录都有东西可看。生产级安全加固（限流、对象存储、监控等）**不做**。

---

## 0. 硬性约束（先读，违反任何一条即停止并汇报）

1. 新建分支 `grok/profile-alignment`，不要直接在 `main` 上提交；不要 force push。
2. 每个 Phase 一个 commit，commit message 用英文，前缀 `[Phase N]`。
3. **不要**碰 `design/` 目录、`docs/tasks/*.pdf`、`apps/api/prisma/migrations/` 里已存在的迁移文件。需要改表只允许**新增**迁移，且必须是 additive（加列带默认值 / 加枚举值），不允许删列、改类型。
4. **不要**改 demo 密码 `project721`、demo 邮箱 `*@toumua.nz`、以及 Demo-Logins 表里已有账号的角色。启动时把 demo 密码重置回 `project721` 是**有意为之**（全组共用演示站，防止有人改密码后别人登不进），保留这个行为，不要加"生产环境跳过"的判断。
5. **不要**改公开品牌文案：`SITE_NAME = "Toumu’a Lending"`、`LEGAL_ENTITY = "Toumu’a Lending Ltd"`、`packages/ui/src/Logo.tsx`。`apps/web/test/brand-copy.test.mjs` 明确禁止 "Money Transfer" 出现在前端；该冲突由 Min 与客户确认，不在本单范围。
6. 金额一律用字符串 + `apps/api/src/lending/money.ts` 的 cents 工具；前端**禁止** `Number.parseFloat` / `Number()` 处理金额。
7. 不要连接 Railway 上的演示库、不要执行 `prisma migrate deploy`、不要修改 Railway 环境变量（全组正在用那个站做演示和截图）。所有 DB 操作只在本地 `toumua_dev` / `toumua_test`。合并到 `main` 后由 Min 触发部署。
8. 开 PR 后**不要**等待或轮询 GitHub Actions；本地测试通过即可。
9. 每个 Phase 完成后运行下方"验证命令"，全绿再进入下一 Phase。任一测试红且 15 分钟内修不好：回退该 Phase 改动，在汇报里标 `BLOCKED`，继续下一 Phase。
10. 不新增 markdown 文档、不重写 README 全文；只按本单指定位置改。

### 环境（Windows 11 + PowerShell）

```powershell
docker compose up -d                 # postgres:5432 + mailpit
pnpm install
Copy-Item .env.example .env          # 如 .env 不存在
pnpm --filter @toumua/api prisma:migrate   # 本地 dev 库
```

### 验证命令（每 Phase 必跑）

```powershell
pnpm --filter @toumua/contracts build
pnpm typecheck
pnpm test:api                        # 若 Windows 下 NODE_ENV=test 报错，先做 Phase 5-B 修脚本
pnpm --filter @toumua/web test
pnpm --filter @toumua/web build
```

---

## Phase 1 · 业务范围对齐 Profile（最高优先级）

Profile 原文要点：
- "The loan officer completes the loan application with the borrower" —— 申请由贷款员录入，不是客户在线自助。
- "The manager decides whether to approve or decline" —— 只有 Manager 有审批权。
- 现有 Demo-Logins 表 `staff@toumua.nz` 描述："prepares applications, no approval"。

### 1-A 客户自助申请改为 feature flag，默认关闭

目标：保留代码，但默认行为符合 Profile。

**API** `apps/api/src/customer/customer.controller.ts`
- 新增 env 读取工具 `apps/api/src/common/feature-flags.ts`：
  ```ts
  export function customerSelfApplyEnabled(): boolean {
    return process.env.FEATURE_CUSTOMER_SELF_APPLY === "1";
  }
  ```
- 以下端点在 flag 关闭时返回 `404`（用 `notFound()` from `common/http.ts`，不要用 403，避免暴露功能存在）：
  - `POST /me/applications`
  - `PATCH /me/applications/:id`
  - `POST /me/applications/:id/assets`
  - `PATCH /me/applications/:id/assets/:assetId`
  - `POST /me/applications/:id/submit`
- `GET /me/applications` 与 `GET /me/applications/:id` **保留**（客户仍可查看贷款员为其录入的申请）。

**Web** `apps/web/src/App.tsx` / `pages/customer.tsx` / `pages/customer-apply.tsx` / `components/marketing/*`
- 新增 `apps/web/src/features.ts`：`export const CUSTOMER_SELF_APPLY = import.meta.env.VITE_FEATURE_CUSTOMER_SELF_APPLY === "1";`
- flag 关闭时：
  - 不注册 `/customer/apply` 路由（访问落到现有 404 页）。
  - 客户首页、Hero、ProcessSteps、`pages/loans.tsx`、`pages/lending.tsx`、`help.tsx` 中所有 "Apply online / Start application" 按钮改为指向 `/help` 或联系信息（文案：`Contact our office to apply`）。用 `rg -n "apply" apps/web/src` 逐个确认。
- `.env.example` 增加两行并注释：
  ```
  # Profile: loan officer completes applications with the borrower. Set to 1 to re-enable customer self-apply.
  FEATURE_CUSTOMER_SELF_APPLY=0
  VITE_FEATURE_CUSTOMER_SELF_APPLY=0
  ```

**测试**
- `apps/api/test/lending.spec.ts` 中 self-apply 用例（约 L272–330）：在 `beforeAll` 内设置 `process.env.FEATURE_CUSTOMER_SELF_APPLY = "1"`，用例结束 `delete`。
- 新增用例：flag 未设置时 `POST /me/applications` 返回 404。

**验收**
- 默认 `.env` 下，登录 `sarah.tama@toumua.nz` 看不到任何 Apply 入口；直接访问 `/customer/apply` 是 404。
- 设置两 flag = 1 后行为与现在完全一致。

### 1-B 审批权限收回 Manager

**API**
- `apps/api/src/lending/approval-policy.ts`：`staffApproveLimit()` 改为：
  ```ts
  const raw = process.env.STAFF_APPROVE_LIMIT?.trim();
  if (!raw) return "0.00";          // Profile default: officers never approve
  ```
  保留解析逻辑；`DEFAULT_STAFF_APPROVE_LIMIT` 常量删除或改为 `"0.00"`。
- `classifyApproval` 在 limit 为 `0.00` 时必须对任何金额返回 `requiresManager: true`。
- `apps/api/src/lending/decisions.service.ts` 不需要改逻辑（已按 `requiresManager` 分流），但 `allowedActions` 给贷款员返回的提示文案改为 `"Approval is a manager decision. Submit the file for manager review."`。

**Web**
- 审批页（`rg -n "requiresManager" apps/web/src` 找到）：贷款员视角只显示 "Send to manager" / 只读；不显示 Approve/Decline 按钮。

**测试**
- `apps/api/test/unit.spec.ts` L240–275 的 `requiresManager` 用例：默认 limit 下全部期望 `true`；新增一个用例显式 `process.env.STAFF_APPROVE_LIMIT="3000.00"` 验证旧行为仍可开启。
- `apps/api/test/batch04.spec.ts` L479 `expect(staffReview.body.requiresManager).toBe(false)` → 该用例改为在 `beforeAll` 设置 `STAFF_APPROVE_LIMIT="3000.00"`，或改期望为 `true` 并让后续步骤用 manager 账号。二选一，优先后者（更贴 Profile）。

**验收**
- `staff@toumua.nz` 在任何金额的申请上都没有 Approve 按钮；`manager@toumua.nz` 有。

### 1-C README 同步

`README.md` 的 demo 账号表和 "What each login can do" 段：
- staff：`Prepares applications with the borrower; cannot approve.`
- 客户账号：`Views own applications, loans and receipts.`（删除 "apply online" 类描述）

---

## Phase 2 · 角色模型修正（Owner / Accountant / Admin / 搜索）

Profile 列出 6 个业务角色：Owner, Manager, Loan Officer, Valuation Officer, Cashier, Accountant。

### 2-A `apps/api/src/lending/access.ts`

- `LENDING_ROLES`、`VALUATION_ROLES` 中**移除** `BusinessRole.OWNER`（文件注释已写明 "an owner has no approval right"，代码与注释矛盾）。
- `MANAGER_ROLES` 保留 OWNER（撤销账户链接属于治理动作，Owner 可做）。
- `assertManageLending` / `assertManageValuation` / `assertManageAccountLink` 中**删除** `Permission.MANAGE_STAFF` 放行分支。`MANAGE_STAFF` 只代表"管理员工账号"，不代表业务权（Demo-Logins：admin = "staff invitations & audit log only"）。`assertRevokeAccountLink` 保留 MANAGE_STAFF 放行。
- `LEDGER_READ_ROLES` **加入** `BusinessRole.OWNER`（Owner 只读全部账目）。
- 新增：
  ```ts
  const BUSINESS_STATUS_ROLES = new Set<string>([BusinessRole.OWNER, BusinessRole.MANAGER, BusinessRole.ACCOUNTANT]);
  export function assertReadBusinessStatus(user: PublicUser) { assertRole(user, BUSINESS_STATUS_ROLES, "an owner, manager or accountant"); }
  ```

**测试**：`pnpm test:api`。若 `lending.spec.ts` / `staff.spec.ts` 里有用 `seedAdmin` 的 agent 去创建借款人/申请而失败，把该操作改用 `seedLoanOfficer` 的 agent，**不要**改回 access.ts。

### 2-B 业务状态接口（给 Owner / Accountant 首页用）

新文件 `apps/api/src/lending/reports.controller.ts` + `reports.service.ts`，注册到 `LendingModule`。

`GET /api/v1/reports/business-status`，守卫 `assertReadBusinessStatus`。返回（全部金额为字符串，两位小数，服务端用 `money.ts` 汇总）：
```json
{
  "asOf": "2026-09-22T01:00:00.000Z",
  "loans": { "active": 12, "defaulted": 1, "settled": 30, "total": 43 },
  "applications": { "draft": 2, "submitted": 3, "approved": 1, "declined": 4 },
  "money": {
    "outstandingPrincipal": "48200.00",
    "disbursedLast30Days": "12000.00",
    "repaidLast30Days": "9850.00",
    "saleReceiptsLast30Days": "0.00"
  },
  "dueToday": 2,
  "overdue": 1
}
```
- `outstandingPrincipal` = ACTIVE + DEFAULTED 贷款 `balance` 之和。
- `dueToday` / `overdue` 用 Auckland 时区（仓库已有 `aucklandDate` 或等价工具，复用）。
- 用 Prisma `groupBy` / `aggregate`，不要把全表拉到 Node 再算。

测试：`apps/api/test/reports.spec.ts` —— owner/manager/accountant 200；loan officer / cashier / customer 403；空库返回全 0 与 `"0.00"`。

### 2-C 员工首页按角色渲染 `apps/web/src/pages/staff.tsx`

当前问题：`/loans?limit=100` 超过 Zod `max(50)` 直接 400；`Promise.all` 一个 403 全页报错；`parseFloat` 算钱。

改法：
- 删除 `/loans?limit=100` 与前端汇总；`outstanding` / `dueToday` 改从 `GET /reports/business-status` 读（Owner/Manager/Accountant）。
- 三个请求拆开，各自 `useEffect` + 各自错误状态；一个失败只在对应卡片显示 "Not available for your role"。
- 角色矩阵（按 `user.role`）：

| 角色 | 业务状态卡 | 待审申请列表 | 最近交易 |
|---|---|---|---|
| OWNER | ✔ | ✘ | ✔（只读） |
| MANAGER | ✔ | ✔ | ✔ |
| ACCOUNTANT | ✔ | ✘ | ✔ |
| LOAN_OFFICER | ✘（显示"我的申请"计数即可） | ✔ | ✘ |
| VALUATION_OFFICER | ✘ | ✘ | ✘（显示待估值队列，已有页面链接即可） |
| CASHIER | ✘ | ✘ | ✔ |

- 不请求该角色无权的接口。

### 2-D 全局搜索按角色过滤 `apps/api/src/search/search.controller.ts`

- 注入 `authUser`，按角色决定查哪些块：
  - `transactions`：仅当 `assertReadLedger` 不抛。
  - `borrowers` / `applications` / `assets`：`assertManageLending` 或 `assertManageValuation` 任一通过。
  - `loans`：`assertReadLedger` 通过。
- 无权的块返回空数组，不抛 403。
- 用 `try { assertX(user); return true } catch { return false }` 的小 helper 即可。

### 2-E 补齐 demo 账号 `apps/api/src/bootstrap/demo-accounts.ts`

在 `seedDemoAccounts` 中新增（密码同 `DEMO_PASSWORD`）：

| 邮箱 | 姓名 | role |
|---|---|---|
| `owner@toumua.nz` | Alice Owner | OWNER |
| `accountant@toumua.nz` | Ken Accountant | ACCOUNTANT |
| `cashier@toumua.nz` | Tui Cashier | CASHIER |
| `valuation@toumua.nz` | Sam Valuer | VALUATION_OFFICER |

`upsertUser` 的 `role` 联合类型要扩成 `BusinessRole | null`。README demo 表同步加 4 行，一句话描述各自能做什么。

---

## Phase 3 · 审批页显示估值 + 资金修正安全网

### 3-A 审批页显示估值总额

Profile："The manager uses the valuation... to decide."

`apps/api/src/lending/decisions.service.ts` 的 `review()` 返回体：
- 每个 asset 增加 `valuationAmount: string | null`（取 `valuations[0].amount`，仅当 status 为已完成态）。
- 顶层增加 `valuationTotal: string`（用 `money.ts` 求和，未估值资产按 0）和 `requestedAmount: string`。
- **不要**加任何"估值必须 ≥ 贷款额"的自动规则——客户未确认比例，只展示。

前端审批页：在申请金额旁并排显示 `Requested $X · Security valued $Y`，资产表增加 Valuation 列。

测试：`batch04.spec.ts` 或新用例断言 `valuationTotal` 与各资产估值和一致。

### 3-B 禁止对 DISBURSEMENT 做金额修正

`apps/api/src/lending/corrections.service.ts`：
- `reallocateForCorrection` 的逻辑只对 REPAYMENT / SALE_RECEIPT 正确；对 DISBURSEMENT 会反向改动还款分配。
- 在**创建**修正请求处（cashier 提交）和**批准**处都加校验：若 `original.type === "DISBURSEMENT"` 且 `replacementAmount !== original.amount`，抛
  `validation("Disbursement amounts cannot be corrected. Reverse and re-disburse with manager approval.")`。允许仅改 `businessDate` / `method` / `externalReference` 的修正。
- 测试：新增用例，DISBURSEMENT 金额修正 → 422；仅改 method → 200。

---

## Phase 4 · Demo 数据：每个登录都有东西可看

现状：`seedDemoAccounts` 只建账号、借款人和账户链接，**没有任何申请 / 贷款 / 交易**。演示时登进 manager 首页是空的，Owner/Accountant 更是什么都没有。评分人看到空页面等于没做。

### 4-A 新脚本 `apps/api/prisma/seed-demo-data.ts`

- 注册到 `apps/api/package.json`：`"prisma:seed-demo-data": "tsx --env-file=../../.env prisma/seed-demo-data.ts"`；根 `package.json` 加 `"seed:demo": "pnpm --filter @toumua/api prisma:seed-demo && pnpm --filter @toumua/api prisma:seed-demo-data"`。
- **不要**挂到启动流程（`bootstrap.service.ts`），只手动跑；幂等：若 `application` 表已有 `number` 以 `DEMO-` 开头的申请（或 notes 含 `demo-seed`）则直接退出并打印 "Demo data already present"。
- 用 `NestFactory.createApplicationContext(AppModule)` 拿到真实 service（`ApplicationsService`、`DecisionsService`、`ValuationsService`、`MoneyService`、`LoansService`），**通过 service 走正常业务流程**，不要直接 `prisma.loan.create` 拼状态，否则审计日志、编号、账本对不上，演示"审计日志"页面时会露馅。
- 操作人使用 demo 账号本身（staff 录申请、valuation 估值、manager 审批、cashier 放款/收款），这样审计页显示的都是 Demo-Logins 表里的名字。

目标数据（10 个 demo 客户各一条申请，覆盖全部状态）：

| 客户 | 申请状态 | 贷款状态 | 说明 |
|---|---|---|---|
| Sarah Tama | APPROVED | ACTIVE，已放款，还了 2 期 | 主演示线：客户端看贷款、收据 |
| James Latu | SUBMITTED | — | 待 manager 审批，资产已估值（车） |
| Mere Kaho | SUBMITTED | — | 待估值（估值官演示） |
| Ana Folau | DRAFT | — | 贷款员正在录（编辑页演示） |
| David Chen | APPROVED | ACTIVE，已放款，0 期 | 今天到期一期（首页 dueToday） |
| Sione Tapu | APPROVED | ACTIVE，逾期 1 期 | 首页 overdue |
| Lisa Wong | APPROVED | SETTLED | 全部还清 |
| Toma Vaka | APPROVED | DEFAULTED | manager 已宣告违约，资产待处置 |
| Rachel Ngata | DECLINED | — | 带拒绝原因 |
| Peter Ioane | APPROVED | 待放款 | cashier 演示放款 |

- 金额范围 $800–$6,000，期数 4–12 周，用现有 `calculation-policy.ts` 的 demo 策略，不要自己算利息。
- 业务日期相对"今天"倒推（用 `Date.now()` 减天数），保证每次跑出来 dueToday / overdue 都成立。
- 一条 cashier 修正请求（对 Sarah 的某期还款改 method），状态 APPROVED 未 POSTED，给 manager 演示。

### 4-B README "Run the demo" 段

在现有 demo 账号表下加 5 行：
```
pnpm seed:demo    # accounts + sample applications/loans, safe to re-run
```
以及一句：每个账号登录后应该能看到什么（对应上表）。

验收：本地 `docker compose down -v && docker compose up -d && pnpm --filter @toumua/api prisma:migrate && pnpm seed:demo` 后，依次登录 owner / manager / staff / valuation / cashier / accountant / sarah.tama，首页均非空，无 4xx/5xx。

---

## Phase 5 · 演示不崩 + 同事能跑

### 5-A 预览服务器崩溃 `apps/web/preview-server.mjs`
Railway 演示站前端就是这个文件。任何人手滑输一个带 `%` 的 URL 会让整个前端进程 `URIError` 退出，演示当场黑屏。
- `decodeURIComponent` 包 `try/catch`，失败返回 400。
- `request.url` 含 `..` 段的直接 400。
- 顶层加 `process.on("uncaughtException", log)` 兜底不退出。

### 5-B 跨平台脚本（组员是 Windows）
- 根 `package.json` devDependencies 加 `cross-env`、`shx`。
- `apps/api/package.json`：
  - `"build": "tsc -p tsconfig.build.json && shx cp -R src/generated dist/generated"`
  - `"test": "cross-env NODE_ENV=test vitest run"`
- `.env.example` 中 `DATABASE_URL` 用户名与 `docker-compose.yml` 的 `POSTGRES_USER` 对齐（当前不一致，以 compose 为准）。

### 5-C 上传照片大小上限 `apps/api/src/lending/uploads.controller.ts`
演示时有人拖一张 40MB 原图进去会把 Railway 免费实例内存打爆。
- multer `limits: { fileSize: 8 * 1024 * 1024, files: 1 }`；超限映射为 413，前端显示 "Photo must be under 8 MB"。

---

## 不在本单范围（不要动）

- 品牌/法定实体名称、联系电话（等 Min 与客户确认）。
- 利息/费用 schema（`ScheduleEntry` 拆 principal/interest、新增 FEE 类型）——等 `calculation-policy.ts` 的客户口径确认后另开单。
- 一切生产级加固：限流按 IP、对象存储、DB 健康检查、会话写库降频、异常过滤器重分类、Electron 差异化。这是课程 demo，不上线。
- 会议纪要、项目计划、图表（Myo / Ian 负责）。

---

## 汇报格式（完成后追加到本文件末尾的 "## 执行回报" 段）

每个 Phase 一行：`Phase N-X · DONE | BLOCKED | SKIPPED · commit <sha> · 一句话说明`。
BLOCKED 必须附：失败命令、错误前 20 行、已尝试的修法。
最后给出：分支名、PR 链接、`pnpm test:api` 与 `pnpm --filter @toumua/web test` 的最终结果摘要（通过/失败数）。

## 执行回报

Phase 1 · DONE · e61f7fd · 客户自助申请默认关闭；贷款员默认不能审批。
Phase 2 · DONE · 6c9eebc · Owner/Accountant 只读业务状态；admin 的 MANAGE_STAFF 不再放行贷款操作；补了四个 demo 账号。
Phase 3 · DONE · 92a1f7c · 审批页返回估值总额；放款金额修正返回 422。
Phase 4 · DONE · c383911 · `seed-demo-data.ts` 用真实 service 造演示数据。Mere 的申请停在已请求估值的草稿，因为未完成估值不能提交。`pnpm seed:demo` 脚本在 Phase 5 的 package.json 里。
Phase 5 · DONE · 38d96a1 · 预览服务器吞掉坏 URL；Windows 脚本用 cross-env/shx；照片超过 8 MB 返回 413。

验证：
- `pnpm --filter @toumua/api exec tsc --noEmit`：通过（需先 `prisma generate`）。
- `pnpm --filter @toumua/web test`：4 passed, 0 failed。
- `pnpm test:api`：BLOCKED。本机没有 Postgres，Docker Desktop 未启动。`Can't reach database server at 127.0.0.1:5432`。已尝试 `docker compose up -d`，管道 `dockerDesktopLinuxEngine` 不存在。单元测试 `unit.spec.ts` 21 passed；依赖数据库的 42 个用例在 beforeAll 连接失败后 skipped。

分支：`grok/profile-alignment`。未连接 Railway，未跑 `prisma migrate deploy`。
