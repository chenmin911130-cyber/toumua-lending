# 执行单 02 · Alice 客户需求落地（资产保管 / 提醒 / 电子合同 / 自动还款 / 忠诚度）

发单人：Min（项目负责人）
执行者：Grok 或 Composer（代码 Agent，按 Phase 分派，见 §0.3）
基线：`grok/profile-alignment` @ `86f575e`（执行单 01 的 Phase 1–5 已完成）
依据：Alice 2026-09-29 邮件《Requirements gathered》（第 1–6 节，下文用 R1–R6 引用）

**定位不变**：COMP721 课程演示系统，不上线服务真实客户。短信、银行扣款、电子签名都做成**演示级但流程完整**：数据模型、权限、审计、界面全部真实，外部通道（短信网关、银行）用可替换的 driver，默认只记录到本地发件箱或队列，不接真实服务商。

---

## 0. 先读

### 0.1 需求差距总表（本单只做"缺"和"部分"）

| Alice 需求 | 现状 | 本单 Phase |
|---|---|---|
| R2/R5 资产登记，并关联借款人和贷款 | 有：`ApplicationAsset` → `Application` → `Borrower` / `Loan` | 3（资产视图补借款人字段） |
| R5 资产标识、状态、价值 | 有：`identifier`、`condition`、`Valuation.amount` | — |
| R5 资产状态：在库 / 退还 / 处置 | 有：`AssetStatus` STORED / RETURNED / SOLD | — |
| R5 **资产修改历史** | 部分：入库、退还、出售有审计；**资产字段编辑、移库没有审计**，也没有界面展示 | 3 |
| R2/R5 **有组织的存放位置记录** | 部分：`location` 只是自由文本 | 3 |
| R3/R6 **到期前 / 到期当天短信提醒** | 缺：只有站内通知，没有短信，也没有定时任务 | 4 |
| R3/R6 **自动还款安排** | 缺 | 6 |
| R3/R6 **电子贷款合同 + 电子签名** | 缺 | 5 |
| R3 **电子文件安全存储** | 部分：资产照片存在私有目录；没有合同或文件库，也没有完整性校验 | 5 |
| R3/R6 网站 | 有：营销站、贷款页、帮助、法律页 | 8（补新功能介绍） |
| R3/R6 **老客户折扣 / 忠诚度** | 缺 | 7 |
| R4 角色权限 | 大体有；Alice 提到 "owner or manager: manage users"，目前 Owner 不能管理用户 | 2 |
| R4 借款人：看贷款、签合同、收提醒 | 看贷款有；签合同和收提醒随 Phase 4/5 补齐 | 4、5 |
| R4 出纳：记录还款、开收据 | 有 | — |

### 0.2 硬性约束（沿用执行单 01，违反任何一条即停止并汇报）

1. 在 `grok/profile-alignment` 基础上新建分支 `agent/client-requirements`；不要直接提交到 `main`；不要 force push。
2. 每个 Phase 一个 commit，commit message 用英文，前缀 `[R-Phase N]`。
3. **不要**碰 `design/`、`docs/tasks/*.pdf`，也不要改已有的 `apps/api/prisma/migrations/*`。每个需要改表的 Phase **新增一个**迁移，且只能是 additive（新表、带默认值的新列、新枚举值）。迁移名：`2026093000000N_<snake_name>`。
4. **不要**改 demo 密码 `project721`、`*@toumua.nz` 邮箱、已有账号的角色、品牌文案（`SITE_NAME`、`LEGAL_ENTITY`、`Logo.tsx`）。
5. 金额一律用字符串，配合 `apps/api/src/lending/money.ts` 的 cents 工具；前端禁止用 `Number()` / `parseFloat` 处理金额。
6. **API 测试只能用隔离运行器** `pnpm test:api:isolated`（即 `node scripts/test-api-isolated.mjs`，已合入 main）。它每次在系统临时目录新建一个一次性 PostgreSQL 16 集群、应用迁移、跑测试、再删掉，不读 `.env`、不碰任何已有数据库。Windows 上用的是 `%USERPROFILE%\tools\pgsql16\bin`（EDB 免安装包，已解压好），可用 `TOUMUA_PG_BIN` 覆盖。`apps/api/test/isolation.ts` 会拒绝在其他数据库上运行，**不要绕过或修改这个守卫**，也不要再用 `pnpm test:api` / `toumua_test`。
   - **开发和 seed 用本机 Docker Postgres**（`docker compose up -d postgres`；主机端口 **5433** 由本地未提交的 `docker-compose.override.yml` 映射，容器名 `toumu-postgres-1`；库名 `toumua_dev`）。连接串写在仓库根目录的 `.env` 里，不要打印、不要提交、不要写进任何文件或日志。
   - **禁止**用 Railway（或任何远程库）做 `prisma migrate`、跑 API 测试或日常开发。
   - 不要提交 `docker-compose.override.yml`。
   - `prisma migrate dev` 只允许针对 `toumua_dev` 执行。
7. 开 PR 后**不要**等待或轮询 GitHub Actions。
8. 不引入真实的第三方付费服务（Twilio、Stripe、DocuSign、Akahu 等）作为必需依赖。只允许写一个 driver 接口，并留好可接入的位置。
9. 新增 npm 依赖上限：`@nestjs/schedule` 一个。签名板在前端用原生 `<canvas>` 实现，不引库；合同用 HTML 打印，不引 PDF 库。
10. 每个 Phase 结束跑验证命令，全绿才进入下一 Phase。任一测试红且 15 分钟内修不好：回退该 Phase，在汇报里标 `BLOCKED`，然后继续下一 Phase（有依赖的除外，见各 Phase 的"依赖"）。
11. 所有新的业务写操作都要调用 `AuditService.write`，`objectType` / `action` 命名风格参照现有的 `asset.intake`、`loan.repay`。
12. 权限判断统一写在 `apps/api/src/lending/access.ts`，controller 和 service 里不要散写角色判断。

### 0.3 分派建议

| Phase | 难度 | 执行者 |
|---|---|---|
| 0 测试库跑通 + 连库保护 | 低 | Composer 2.5 |
| 2 角色补丁 | 低 | Composer 2.5 |
| 3 资产保管增强 | 中 | Grok 4.7 |
| 4 短信提醒 | 中 | Grok 4.7 |
| 5 电子合同 + 签名 + 文件库 | **高** | Grok 4.7 |
| 6 自动还款安排 | 高 | Grok 4.7 |
| 7 忠诚度折扣 | 中 | Grok 4.7 |
| 8 网站与 README 同步、demo 数据 | 低 | Composer 2.5 |

所有 Phase 按编号**串行**执行，在同一个分支上一个接一个做，不要并行。

### 0.4 环境（Windows 11 + PowerShell + 本机 Docker Postgres）

先启动数据库：`docker compose up -d postgres`（端口 5433 依赖本地 `docker-compose.override.yml`，勿提交该文件）。

`.env` 的 `DATABASE_URL` 指向 `127.0.0.1:5433` 上的 `toumua_dev`，只用于开发和 seed。**不要用 Railway 做开发或测试。**

```powershell
pnpm install
pnpm --filter @toumua/api prisma:generate
pnpm --filter @toumua/contracts build             # 改了 contracts 后必须重建，否则 api 类型检查会用旧的 dist
pnpm --filter @toumua/api prisma:migrate          # 作用于 toumua_dev
```

完整 `pnpm test:api:isolated` 约 **1.5 分钟**。开发中只跑相关 spec：`node scripts/test-api-isolated.mjs test/custody.spec.ts`（参数原样传给 vitest）。每个 Phase 提交前完整跑一次。

- 每次运行都用自己的一次性集群，不会互相 TRUNCATE，但仍请一次只跑一个，避免机器过载。
- 在 Windows 上，`isolation.spec.ts` 里有 3 个用例用的是 POSIX 路径夹具，会被跳过。这是预期行为，全量结果应为 **0 failed、3 skipped**。
- 切换分支、stash 后如果出现“列不存在”或 contracts 类型错误，先 `prisma:generate` 并重建 contracts，不要去改代码。

### 0.5 验证命令（每个 Phase 必跑）

```powershell
pnpm --filter @toumua/contracts build
pnpm typecheck
pnpm test:api:isolated
pnpm --filter @toumua/web test
pnpm --filter @toumua/web build
```

---

## Phase 0 · 让数据库测试真正跑起来（前置，阻塞后续全部）

执行单 01 的回报写着 `pnpm test:api` 为 BLOCKED：本机没有 Docker，42 个数据库用例被跳过。现在改用 Railway 上的独立测试实例，不需要 Docker。

### 0-A 连库保护（先做，防止误清线上库）

`apps/api/test/helpers.ts` 在设置 `process.env.DATABASE_URL` 之后，立刻加上：

```ts
const testDbName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");
if (!testDbName.endsWith("_test")) {
  throw new Error(`Refusing to run tests against database "${testDbName}". TEST_DATABASE_URL must point to a *_test database.`);
}
```

线上库的库名不是 `*_test`，这样即使 `.env` 配错，测试也会在 TRUNCATE 之前直接退出。

### 0-B Windows 可用的测试库迁移脚本

`apps/api/package.json` 里的 `prisma:migrate:test` 用的是 `DATABASE_URL=${TEST_DATABASE_URL}` 这种 bash 写法，在 PowerShell 下跑不了。新建 `apps/api/scripts/migrate-test.cjs`：用 `dotenv` 读取 `../../.env`，把 `DATABASE_URL` 设为 `TEST_DATABASE_URL`，同样校验库名以 `_test` 结尾，然后 `spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { stdio: "inherit", shell: true, env })`。脚本改为 `"prisma:migrate:test": "node scripts/migrate-test.cjs"`。

### 0-C 跑通

- `pnpm --filter @toumua/api prisma:migrate`（针对 dev 库）和 `pnpm --filter @toumua/api prisma:migrate:test` 都能成功。
- 执行 `pnpm test:api`，记录通过和失败数量。
- 如果执行单 01 的改动导致已有用例失败，**在本 Phase 修好**（只修测试或实现中的真实 bug，不要削弱断言）。
- 如果因为网络延迟出现超时，可以在 `apps/api/vitest.config.ts` 里把 `testTimeout` / `hookTimeout` 调到 60000，但不要改其他任何东西。
- 验收：`pnpm test:api` 没有 skipped，失败数为 0。
- 如果连不上 Railway 测试库：标 `BLOCKED`，**停止整单**并汇报。不要在没有数据库测试的情况下继续做 Phase 3–7。

---

## Phase 2 · 角色补丁（R4）

Alice 写的是 "Owner or manager: approve loans, manage users, review records and produce reports"，并注明**这些角色定义以后还要和客户确认**。审批权保持只归 Manager（执行单 01 已按 Profile 定下）；这里只补 "manage users"。

- `apps/api/src/lending/access.ts` 的 `canManageStaffAccounts`：在 `isManager(user)` 之外，再放行 `user.role === BusinessRole.OWNER`。
- `apps/api/test/staff.spec.ts` 新增用例：owner 可以 `GET` 员工列表并发出邀请；cashier 调用同一接口返回 403。
- `README.md` 的 demo 账号表：owner 一行描述改为 `Read-only business status and reports; manages staff accounts; cannot approve loans.`
- 不改其他权限。

---

## Phase 3 · 资产保管增强（R2、R5，最高业务优先级）

Alice 说最大的问题是抵押物没有固定、安全的存放点，有被盗风险。当前系统已有保管链（`CustodyEvent`），这一 Phase 补三件事：结构化的存放位置、完整的修改历史、资产视图显示借款人。

### 3-A 存放位置主数据

**Schema（新迁移 `20260930000001_storage_locations`）**

```prisma
enum StorageLocationKind {
  SAFE
  LOCKED_CABINET
  SHELF
  SECURE_YARD
  OFFSITE
}

model StorageLocation {
  id        String              @id @default(cuid())
  code      String              @unique   // e.g. "SAFE-A-01"
  name      String
  kind      StorageLocationKind
  secure    Boolean             @default(true)
  capacity  Int?
  notes     String?
  active    Boolean             @default(true)
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt

  custodyEvents CustodyEvent[]
}
```

在 `CustodyEvent` 上加 `storageLocationId String?`，并建立到 `StorageLocation` 的关系（`onDelete: SetNull`）。保留原有的 `location String?`：写入时把所选位置的 `code` 同步写进去，这样历史数据和旧界面都不受影响。

**Contracts** `packages/contracts/src/lending.ts`
- `intakeSchema`：新增 `storageLocationId: z.string().optional().nullable()`。PASS 时的校验改为 `storageLocationId` 或 `location` 二者至少有一个（保持向后兼容，但新界面只提交 `storageLocationId`）。
- `custodyUpdateSchema`：同样新增 `storageLocationId`，规则一样。
- 新增 `storageLocationSchema`（code 用正则 `^[A-Z0-9-]{2,20}$`；name 1–100；kind 取枚举值；capacity 可选正整数）和 `StorageLocationView`（在上述字段之外加 `occupied: number`，表示当前 STORED 在此处的资产数）。
- `AssetView` 新增 `storageLocation: { id, code, name, kind, secure } | null`，同时保留原来的 `storageLocation` 字符串字段，改名为 `storageLocationLabel`。前端全部引用处都要一起改：`rg -n "storageLocation" apps/web/src`。

**API**
- 新文件 `apps/api/src/lending/storage-locations.controller.ts` 和 `storage-locations.service.ts`，注册到 `LendingModule`：
  - `GET /api/v1/storage-locations`：参数 `?active=true`，返回列表和 `occupied`。权限用 `assertReadLedger`。
  - `POST /api/v1/storage-locations`、`PATCH /api/v1/storage-locations/:id`：新增 `assertManageStorageLocations`，只允许 MANAGER 和 VALUATION_OFFICER。
  - 停用前检查：仍有 STORED 资产在该位置时返回 409 `"Move the stored assets out before deactivating this location"`。
  - 所有写操作写审计：`storage_location.create` / `storage_location.update`。
- `custody.service.ts`：
  - `intake` / `updateCustody`：传了 `storageLocationId` 时，校验位置存在且 `active`，否则 422；有 `capacity` 且 `occupied >= capacity` 时返回 409 `"This location is full"`。
  - "当前位置"的算法改为：取**最新一条** STORED 或 RELOCATED 事件。现有 `toAssetView` 用 `find(type === STORED)` 取的是第一条，移库后显示的仍是旧位置，这是 bug，一并修掉。
  - `updateCustody` 现在**没有写审计**，补上 `asset.relocate`，`before` / `after` 记录位置 code。
- 在 `seedDemoAccounts` 之外、`seed-demo-data.ts` 之内，幂等地（按 `code` 做 upsert）建 5 个位置：`SAFE-A-01` Main safe, `SAFE-A-02` Main safe lower shelf, `CAB-B-01` Locked cabinet B, `YARD-01` Secure vehicle yard, `OFF-01` Off-site storage (partner)。已有 demo 资产的入库改为选这些位置。

**Web**
- 新页面 `/staff/storage`（加进员工导航，manager、valuation officer、owner 可见）：位置表格（code、名称、类型、在库数/容量、是否安全），点一行展开该位置当前的资产清单（资产名称、借款人、贷款号，链接到 `/staff/collateral/:id`）。manager 和 valuation officer 可以新增、编辑、停用。
- 入库与移库表单里，把位置文本框换成下拉框：数据来自 `GET /storage-locations?active=true`，格式为 `SAFE-A-01 · Main safe (3/10)`，已满的位置禁用。

### 3-B 资产修改历史

- `applications.service.ts` 里编辑资产的方法（PATCH `.../assets/:assetId`，staff 端和 customer 端都要改）：写 `asset.update` 审计，`before` / `after` 只记录发生变化的字段（name、description、condition、category、identifier）。新增资产写 `asset.create`，删除写 `asset.delete`。
- `valuations.service.ts` 完成估值时写 `asset.valuation`，`after` 为 `{ amount, basis }`（如果已有 `valuation.*` 审计，就复用，不要重复写）。
- 新接口 `GET /api/v1/assets/:id/history`（`assets.controller.ts`）：合并该资产的审计事件和保管事件，按时间倒序返回 `{ at, actor, kind: "audit" | "custody", action, summary, before, after }`。权限用 `assertReadLedger`。`summary` 在服务端生成英文短句，例如 `Moved from SAFE-A-01 to CAB-B-01 — reason: shelf repair`。
- `/staff/collateral/:id` 详情页新增 "History" 标签页，时间线展示上面的接口。

### 3-C 资产视图显示借款人

- `CustodyService.loadAsset` 在 `application.select` 里加 `borrower: { select: { id, number, name } }`；`AssetView` 新增 `borrower: { id, number, name } | null`。
- `/staff/collateral` 列表加 "Borrower" 列；列表的搜索 `q` 也要能匹配借款人姓名和编号。

**测试** `apps/api/test/custody.spec.ts`（新文件，复用 `test/helpers.ts`）
1. 选位置入库后，`storageLocation.code === "SAFE-A-01"`，`occupied` 增加 1。
2. 移库后，当前位置变为新位置（回归前面的 bug），并且有 `asset.relocate` 审计。
3. 往已满的位置入库返回 409；往已停用的位置入库返回 422。
4. 位置上还有资产时停用返回 409。
5. 编辑资产 condition 后，`/assets/:id/history` 里有一条 `asset.update`，`before.condition` 和 `after.condition` 都正确。
6. cashier 调 `POST /storage-locations` 返回 403。

**验收**：用 `valuation@toumua.nz` 登录：`/staff/storage` 能看到 5 个位置和占用数；把一件资产从 SAFE-A-01 移到 CAB-B-01，详情页 History 出现这条记录，当前位置也正确更新。

---

## Phase 4 · 还款短信提醒（R3、R6）

### 4-A 短信发件箱与 driver

**Schema（新迁移 `20260930000002_sms_reminders`）**

```prisma
enum SmsStatus {
  QUEUED
  SENT
  FAILED
  SKIPPED
}

enum ReminderKind {
  DUE_SOON      // N days before due date
  DUE_TODAY
  OVERDUE
}

model SmsMessage {
  id          String    @id @default(cuid())
  toPhone     String
  body        String
  status      SmsStatus @default(QUEUED)
  driver      String
  providerRef String?
  error       String?
  borrowerId  String?
  loanId      String?
  createdAt   DateTime  @default(now())

  @@index([createdAt])
  @@index([borrowerId])
}

model RepaymentReminder {
  id              String       @id @default(cuid())
  scheduleEntryId String
  kind            ReminderKind
  smsMessageId    String?      @unique
  createdAt       DateTime     @default(now())

  @@unique([scheduleEntryId, kind])   // idempotency: one reminder of each kind per installment
}
```

`Borrower` 加 `smsOptIn Boolean @default(true)`。

- 新模块 `apps/api/src/sms/sms.module.ts` 和 `sms.service.ts`，结构参照 `mail.service.ts`：
  - `SMS_DRIVER` 取值 `log`（默认，只写发件箱并打印 logger）、`memory`（测试用）、`webhook`（POST JSON `{to, body}` 到 `SMS_WEBHOOK_URL`，给以后接网关留口子）。
  - `send({ toPhone, body, borrowerId?, loanId? })`：先写 `QUEUED`，发送成功改为 `SENT`，异常改为 `FAILED` 并记录 `error`。**不抛异常**，因为提醒失败不能影响业务。
  - 手机号规范化：去掉空格和横线；`0` 开头的替换为 `+64`。规范化后不符合 `^\+\d{8,15}$` 的记为 `SKIPPED`，`error = "invalid phone"`。
- `.env.example` 新增：
  ```
  # SMS reminders (demo). log = write to outbox only. webhook = POST to SMS_WEBHOOK_URL.
  SMS_DRIVER=log
  SMS_WEBHOOK_URL=
  REMINDER_DAYS_BEFORE=3
  REMINDER_CRON_ENABLED=1
  ```

### 4-B 提醒任务

- 安装 `@nestjs/schedule`，在 `AppModule` 里 `ScheduleModule.forRoot()`。
- 新文件 `apps/api/src/reminders/reminders.service.ts` 和 `reminders.module.ts`：
  - `runDue(asOf: Date = new Date()): Promise<{ dueSoon: number; dueToday: number; overdue: number; skipped: number }>`
  - 使用 Auckland 本地日期：把 `reports.service.ts` 里的私有函数 `aucklandDay()` 移到 `apps/api/src/common/dates.ts` 并导出，`reports.service.ts` 改为从那里 import（行为不变），提醒和 Phase 6 的 collections 也都用它，不要另写一套。
  - 扫描条件：`ScheduleEntry.status = PENDING`，所属 `Loan.status = ACTIVE`，`Borrower.smsOptIn = true`。
    - `dueDate` 等于 `asOf + REMINDER_DAYS_BEFORE` 天 → DUE_SOON
    - `dueDate` 等于 `asOf` 当天 → DUE_TODAY
    - `dueDate` 早于 `asOf`，且还没发过 OVERDUE → OVERDUE（每期只发一次）
  - 先 `create` RepaymentReminder 行，唯一键冲突就跳过（保证幂等），然后发短信，再回填 `smsMessageId`。
  - 同时调用 `NotificationsService.notifyBorrower` 发一条站内通知，文案与短信相同。
  - 文案（英文，160 字符以内，金额取该期剩余应还 `amount - paidAmount`）：
    - DUE_SOON: `Toumu'a Lending: repayment of $120.00 for loan L-0001 is due on Fri 3 Oct. Reply or call us if you need help.`
    - DUE_TODAY: `Toumu'a Lending: repayment of $120.00 for loan L-0001 is due today.`
    - OVERDUE: `Toumu'a Lending: repayment of $120.00 for loan L-0001 was due on Fri 3 Oct and is now overdue. Please contact us.`
    - 如果借款人有 ACTIVE 的自动还款安排（Phase 6），DUE_SOON 改为 `...will be collected automatically on Fri 3 Oct.`。Phase 6 之前这个分支先不写，Phase 6 里再补。
  - `@Cron("0 8 * * *", { timeZone: "Pacific/Auckland" })` 调 `runDue()`。仅在 `REMINDER_CRON_ENABLED === "1"` 且 `NODE_ENV !== "test"` 时执行。
- 演示用的手动触发：`POST /api/v1/reminders/run`（body 可选 `{ asOf: "YYYY-MM-DD" }`），新增 `assertRunReminders`，只允许 MANAGER。
- `GET /api/v1/sms-outbox?cursor&limit`：MANAGER、OWNER、CASHIER 可读，按时间倒序。

**Web**
- 新页面 `/staff/reminders`：顶部是 "Run reminders now" 按钮（仅 manager 可见），可选日期，返回结果显示为 `3 due soon · 1 due today · 1 overdue`；下方是短信发件箱表格（时间、手机号打码为 `+64 21 *** 456`、借款人、正文、状态）。
- 借款人编辑页加 "Send SMS repayment reminders" 复选框，对应 `smsOptIn`；borrower 的 contracts schema 同步加这个字段。
- 客户端 `/customer/loans/:loanId`：显示 `Reminders: SMS to +64 21 *** 456, 3 days before each due date`。

**测试** `apps/api/test/reminders.spec.ts`（`SMS_DRIVER=memory`）
1. 构造一期在 `asOf + 3` 天到期的贷款，`runDue(asOf)` 生成 1 条 DUE_SOON，`SmsMessage.status = SENT`，并且有一条站内通知。
2. 同一 `asOf` 再跑一次：计数为 0，不会重复发。
3. 已经 PAID 的期数不发；`smsOptIn=false` 不发；SETTLED 的贷款不发。
4. 手机号 `abc` 记为 SKIPPED，其他提醒照常发出。
5. cashier 调 `POST /reminders/run` 返回 403。
6. 单元测试：手机号规范化 `021 234 5678` → `+64212345678`。

**验收**：`pnpm seed:demo` 后用 manager 登录，在 `/staff/reminders` 点 Run：David Chen（今天到期）出现 DUE_TODAY，Sione Tapu（逾期）出现 OVERDUE；用 sarah.tama 登录，通知里能看到对应的站内提醒。

---

## Phase 5 · 电子贷款合同 + 电子签名 + 文件安全存储（R3、R6，最重的一块）

依赖：Phase 3 的审计写法；Phase 0。

### 5-A 文件库（安全存储）

**Schema（新迁移 `20260930000003_documents_contracts`）**

```prisma
enum DocumentKind {
  LOAN_CONTRACT_SIGNED
  SIGNATURE_IMAGE
  BORROWER_ID
  OTHER
}

model Document {
  id           String       @id @default(cuid())
  kind         DocumentKind
  borrowerId   String?
  loanId       String?
  filename     String
  mimeType     String
  sizeBytes    Int
  sha256       String
  storageKey   String       @unique
  uploadedById String?
  createdAt    DateTime     @default(now())
  deletedAt    DateTime?    // soft delete only; the file is kept

  @@index([borrowerId])
  @@index([loanId])
}
```

- 新文件 `apps/api/src/documents/documents.service.ts`：
  - 存储目录用 `DOCUMENT_DIR`，默认值是 `UPLOAD_DIR` 下的 `documents/` 子目录。复用 `uploads.service.ts` 里目录的解析方式，不要放进 `apps/web/public`，也不要做任何静态托管。
  - `store({ kind, buffer, filename, mimeType, borrowerId?, loanId?, userId? })`：计算 sha256，`storageKey = randomUUID()`（不带原始文件名），写文件后建记录，写审计 `document.store`。
  - `open(user, id)`：读文件并重新计算 sha256，与记录不一致时返回 409 `"Document integrity check failed"`，并写审计 `document.integrity_failed`；一致则返回流，并写审计 `document.read`。
  - 权限：staff 用 `assertReadLedger`；customer 只能读自己借款人（通过 ACTIVE 的 `BorrowerAccountLink`）名下的文件，否则返回 404。
  - 上传员工文件：`POST /api/v1/borrowers/:id/documents`（multipart，单文件 10 MB 以内，只允许 `application/pdf`、`image/png`、`image/jpeg`，用魔数嗅探；参照 `uploads.service.ts` 的 PNG 签名检查）。权限用 `assertManageLending`。
  - `GET /api/v1/documents/:id/file` 下载；`GET /api/v1/borrowers/:id/documents` 列表；`DELETE /api/v1/documents/:id` 软删除（仅 MANAGER）。
- 借款人详情页新增 "Documents" 区块：列表 + 上传 + 下载，显示 sha256 前 12 位作为 "fingerprint"。

### 5-B 合同模型与生成

```prisma
enum ContractStatus {
  ISSUED     // generated at approval, waiting for signature
  SIGNED
  VOID
}

model LoanContract {
  id                String         @id @default(cuid())
  number            String         @unique   // "C-0001", via NumbersService
  loanId            String
  version           Int            @default(1)
  status            ContractStatus @default(ISSUED)
  bodyHtml          String
  contentSha256     String
  issuedAt          DateTime       @default(now())
  signedAt          DateTime?
  signerName        String?
  signerMethod      String?        // "PORTAL" | "IN_BRANCH"
  signerIp          String?
  signerUserAgent   String?
  signatureDocId    String?        @unique
  signedDocId       String?        @unique
  witnessedById     String?
  voidedAt          DateTime?
  voidReason        String?

  @@unique([loanId, version])
  @@index([loanId, status])
}
```

- 新文件 `apps/api/src/contracts/contracts.service.ts` 和 `contract-template.ts`。
- `renderContract(loan): string`：纯函数，输出一段**自包含的 HTML**（内联 CSS，不引外部资源），内容包括：合同编号、日期、贷方 `LEGAL_ENTITY`（从 `apps/api` 可以访问的共享常量读取；如果只在 web 端有，就在 contracts 包里新增一个 `LEGAL_ENTITY` 常量并让两端共用，**值不能改**）、借款人姓名、编号、地址，本金，利率（`annualRateBps` 与忠诚度折扣，Phase 7 之后才有折扣），还款频率和期数，**完整的还款计划表**（`ScheduleEntry`），抵押物清单（名称、标识、估值），违约与抵押物处置条款，借款人确认条款，签名区。
  - 条款正文放在 `contract-template.ts` 里的常量 `CONTRACT_CLAUSES: string[]`，先写 6 条演示条款，文末注明 `Demonstration contract for COMP721. Not legal advice.`。
  - 所有插值都必须做 HTML 转义，自己写一个 `escapeHtml`，并加单测。
- `contentSha256 = sha256(bodyHtml)`。
- **生成时机**：`DecisionsService.approve` 在同一事务内建好 Loan 之后，调用 `contracts.issue(tx, loanId, user)`。事务内不能写文件；文件在签名时才写。审计 `contract.issue`。
- `reissue(user, loanId, reason)`：只允许 MANAGER，只在 `APPROVED_UNFUNDED` 且合同未签时可用。把旧版本置为 VOID，新建 `version + 1`。用于条款改动后重新出合同。

### 5-C 电子签名

- 借款人线上签：`POST /api/v1/me/contracts/:id/sign`，body：
  ```ts
  { typedName: string; signaturePng: string /* data:image/png;base64,... ≤ 200 KB */; consent: true; contentSha256: string }
  ```
  - 校验：合同属于当前客户、状态是 ISSUED、`typedName` 去空格后与借款人姓名大小写不敏感地一致（不一致返回 422 `"Type your full name as shown on the contract"`）、`consent === true`、`contentSha256` 等于库里的值（防止签的是旧页面，不一致返回 409 `"This contract has changed. Reload and review it again."`）。
  - 签名 PNG 要解码并校验魔数，然后用 `documents.store` 存为 `SIGNATURE_IMAGE`。
  - 生成**签署版 HTML**：原 `bodyHtml` 加上签署页（签名图以 base64 内嵌、签署人、时间、IP、UA、`contentSha256`），存为 `LOAN_CONTRACT_SIGNED`。
  - 更新合同为 SIGNED，填好各签署字段；写审计 `contract.sign`；通知 lending staff。
- 柜台签：`POST /api/v1/contracts/:id/sign-in-branch`，贷款员或经理可用（`assertManageLending`），body 与上面相同但去掉 `consent`，改为 `borrowerPresent: true`。`signerMethod = "IN_BRANCH"`，`witnessedById = user.id`。给没有线上账号的借款人用。
- **放款门槛**：`LoansService.disbursementReadiness` 增加一项检查 `{ id: "contract_signed", label: "Loan contract signed", ok: boolean }`，没签就不能放款。现有放款相关测试要先签合同再放款，在 `test/helpers.ts` 里加一个 `signContractInBranch(agent, loanId)` helper。
- `seed-demo-data.ts`：已放款的 demo 贷款在放款前通过 service 签好合同（Sarah 用 PORTAL，其他人用 IN_BRANCH）；Peter Ioane（待放款）的合同**保持 ISSUED 不签**，留给现场演示签名流程。

**Web**
- 客户端：`/customer/loans/:loanId` 在有 ISSUED 合同时显示醒目的横幅 "Your loan contract is ready to sign"，链接到新页面 `/customer/contracts/:id`：
  - 在 `<iframe sandbox srcdoc={bodyHtml}>` 里渲染合同。sandbox **不加** `allow-scripts`。
  - 要求滚动到底部后才能签（监听 iframe 容器的滚动）。
  - 姓名输入框、签名画板（原生 canvas，支持鼠标和触摸，有 "Clear" 按钮，空白画布不允许提交）、同意复选框（`I have read and agree to this loan contract`），点击 "Sign contract"。
  - 签完后显示签署时间和 "Download signed copy"（走 documents 下载接口）。
- 员工端：`/staff/loans/:id` 新增 "Contract" 卡片，显示状态、版本、签署方式和时间，操作包括 "View"、"Sign in branch"（弹窗里也是签名板）、"Reissue"（仅经理），以及 "Print"（`window.print()` 打印 iframe 内容）。
- 放款页的 readiness 列表会自动显示新增的检查项，确认一下展示正常。

**测试** `apps/api/test/contracts.spec.ts`
1. 审批通过后自动生成 ISSUED 合同，HTML 里包含借款人姓名、本金和每一期的还款日。
2. `escapeHtml`：借款人姓名为 `<script>` 时，HTML 中只出现 `&lt;script&gt;`。
3. 客户用错误姓名签 → 422；用过期的 sha → 409；签别人的合同 → 404；正确签署 → 200，并生成 2 个 Document（签名图、签署版），审计里有 `contract.sign`。
4. 未签合同时放款返回 422，readiness 中 `contract_signed.ok === false`；柜台签后放款成功。
5. 已签的合同调 `reissue` 返回 409。
6. 篡改磁盘上的文件内容后下载返回 409，并写 `document.integrity_failed` 审计。
7. customer 下载别人名下的 Document 返回 404。

**验收**：manager 审批 → sarah.tama（或 Peter 的账号）登录后看到待签横幅 → 签名 → 员工端合同卡片变为 SIGNED → cashier 可以放款。整个流程可以在 3 分钟内现场演示完。

---

## Phase 6 · 自动还款安排（R3、R6）

依赖：Phase 5（都改 money / loans）。

业务口径：新西兰小贷常见做法是借款人给银行设 **automatic payment**（定期转账），或者签 **direct debit authority**（直接借记授权）。系统不接银行，只做三件事：(1) 记录借款人的安排；(2) 到期时生成"待入账的自动扣款"清单；(3) 出纳确认到账后一键入账。**资金入账仍然只能由出纳执行**，这是执行单 01 定下的规则，不能改。

**Schema（新迁移 `20260930000004_repayment_arrangements`）**

```prisma
enum ArrangementMethod {
  BANK_AUTOMATIC_PAYMENT
  DIRECT_DEBIT
}

enum ArrangementStatus {
  REQUESTED
  ACTIVE
  CANCELLED
}

model RepaymentArrangement {
  id                String            @id @default(cuid())
  loanId            String
  method            ArrangementMethod
  status            ArrangementStatus @default(REQUESTED)
  accountName       String
  accountNumberLast4 String           // never store the full account number
  bankName          String?
  requestedById     String
  activatedById     String?
  activatedAt       DateTime?
  cancelledAt       DateTime?
  cancelReason      String?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@index([loanId, status])
}
```

**规则**
- 每笔贷款最多只能有一个 REQUESTED 或 ACTIVE 的安排，重复申请返回 409。
- 请求体里的账号字段 `accountNumber` 必须符合新西兰格式 `^\d{2}-\d{4}-\d{7}-\d{2,3}$`；服务端**只保存后 4 位**，完整号码不写库、不进日志、不进审计。这一点要写一个测试，断言审计 `after` 中不包含完整账号。
- 客户申请：`POST /api/v1/me/loans/:id/arrangements`（贷款必须是 ACTIVE 或 APPROVED_UNFUNDED）。员工代办：`POST /api/v1/loans/:id/arrangements`（`assertManageLending`）。
- 激活：`POST /api/v1/arrangements/:id/activate`，新增 `assertActivateArrangement`，允许 CASHIER 和 MANAGER（出纳在银行端确认已收到授权后操作）。
- 取消：客户本人、贷款员、出纳、经理都可以，必须填原因。
- 贷款结清（SETTLED）或违约（DEFAULTED）时，在对应 service 的同一事务内，把 ACTIVE 安排自动改为 CANCELLED，`cancelReason = "Loan settled"` / `"Loan defaulted"`。
- 全部写审计：`arrangement.request` / `arrangement.activate` / `arrangement.cancel`。

**自动扣款入账**
- `GET /api/v1/arrangements/collections?date=YYYY-MM-DD`（`assertPostMoney`）：列出 ACTIVE 安排、且对应贷款在该日（Auckland 日期）或之前有 PENDING 期数的条目，返回贷款号、借款人、期号、应收金额和 `idempotencyKey`。
- `POST /api/v1/arrangements/collections/:scheduleEntryId/post`，body `{ received: true, amount?: string, externalReference?: string }`：
  - 内部直接调用 `MoneyService.repay(user, loanId, { amount: amount ?? 该期剩余应还, method: "AUTOMATIC_PAYMENT", businessDate: date, externalReference, expectedVersion: loan.version }, idempotencyKey)`。
  - `idempotencyKey = "auto:" + scheduleEntryId + ":" + 当前 paidAmount`，保证重复点击不会重复入账。
  - 如果 `RepaymentInput.method` 是枚举，就在 contracts 里加上 `AUTOMATIC_PAYMENT`。
- 回到 Phase 4 的 `reminders.service.ts`，补上 DUE_SOON 的自动扣款文案分支。

**Web**
- 客户端 `/customer/loans/:loanId`："Automatic repayments" 卡片，显示状态，有 "Set up automatic repayments" 表单（方式单选、户名、账号、银行），提交后显示 "Requested — we'll confirm once your bank authority is received"；已激活的显示 `Active · account ending 1234` 和取消按钮。
- 员工端 `/staff/loans/:id`：同样的卡片，外加 "Activate" 和 "Cancel"。
- 出纳新页面 `/staff/collections`（导航里对 cashier 和 manager 可见）：选择日期，列出待入账的自动扣款，每行有 "Mark received"（可修改金额、填银行流水号），点击后入账并出收据，这一行从列表中消失。

**测试** `apps/api/test/arrangements.spec.ts`
1. 客户申请 → 出纳激活 → collections 列表里出现到期的期数 → 点 post 后生成 REPAYMENT 与收据，`method = AUTOMATIC_PAYMENT`。
2. 用同一 key 重复 post，只入账一次（replay）。
3. 已有 ACTIVE 安排时再申请返回 409。
4. 账号格式错误返回 422；库里和审计里都找不到完整账号。
5. 贷款结清后，安排自动变为 CANCELLED。
6. 贷款员调用 activate 返回 403；客户调用 collections 返回 403。

---

## Phase 7 · 老客户折扣 / 忠诚度（R3、R6）

客户还没确认折扣比例，所以**全部做成配置，界面上标注 "Demo rates, subject to client confirmation"**。

**规则**
- 忠诚度等级只按该借款人**已结清（SETTLED）且从未违约**的贷款笔数计算：
  - 0 笔 → `STANDARD`，折扣 0
  - 1–2 笔 → `RETURNING`，默认 −200 bps（年利率降 2 个百分点）
  - 3 笔及以上 → `LOYAL`，默认 −400 bps
  - 借款人名下有任何 DEFAULTED 贷款 → 一律 `STANDARD`
- 环境变量 `LOYALTY_TIERS`，JSON 格式，默认 `[{"tier":"RETURNING","minSettled":1,"discountBps":200},{"tier":"LOYAL","minSettled":3,"discountBps":400}]`，解析失败时回退到默认值并打印 warn。
- 折扣后的利率不低于 0。

**实现**
- 新文件 `apps/api/src/lending/loyalty-policy.ts`，纯函数：
  ```ts
  export type LoyaltyTier = "STANDARD" | "RETURNING" | "LOYAL";
  export function loyaltyTiers(): Array<{ tier: LoyaltyTier; minSettled: number; discountBps: number }>;
  export function classifyLoyalty(input: { settledCount: number; hasDefault: boolean }): { tier: LoyaltyTier; discountBps: number };
  ```
- `calculation-policy.ts`：`simpleInterest(principal, frequency, periods, annualRateBps = demoAnnualRateBps())`，新增可选参数，默认行为不变。`buildTermsPreview` 增加可选参数 `discountBps = 0`，实际利率 = `max(0, demoAnnualRateBps() - discountBps)`；返回体增加 `baseAnnualRateBps`、`discountBps`、`annualRateBps`（折后）、`loyaltyTier`。
- **Schema（新迁移 `20260930000005_loyalty`）**：`ApplicationTerms` 和 `Loan` 各加 `loyaltyTier String @default("STANDARD")` 和 `discountBps Int @default(0)`。
- 申请的 terms 预览与保存时，由服务端查询借款人的历史并计算等级（不接受前端传入的折扣）。**审批时冻结**到 `Loan`，之后借款人等级变化不影响已批准的贷款。
- `buildSchedule` 生成计划时使用冻结后的利率。
- 合同模板（Phase 5）的利率行显示 `21.00% p.a. less 2.00% returning-customer discount = 19.00% p.a.`；没有折扣时只显示利率。
- `GET /api/v1/borrowers/:id` 返回 `loyalty: { tier, settledCount, discountBps }`。

**Web**
- 借款人详情页和申请 Terms 步骤：显示等级徽章（Standard / Returning / Loyal）和 "Saves $X.XX interest on this loan"。金额由服务端返回的两种利息计算结果相减得出，前端不算钱。
- 审批页并排显示 `Base rate 21.00% · Loyalty −2.00% · Applied 19.00%`。
- 客户端首页：有等级的客户显示 "You're a Returning customer — your next loan gets 2.00% p.a. off"。
- 营销站 `/loans` 页面新增 "Rewards for returning borrowers" 小节，写明两档规则，并附一行小字 "Demo rates, subject to confirmation"。

**测试**
- `unit.spec.ts`：`classifyLoyalty` 的边界 0/1/2/3、有违约、非法 JSON 回退默认；`simpleInterest` 带折扣后金额正确，并且不带参数时结果与原来一致（回归）。
- `lending.spec.ts`：Lisa Wong 类型的借款人（有 1 笔 SETTLED）新建申请，terms 预览中 `discountBps = 200`；审批后 Loan 冻结为 200；此后再结清一笔，已批准贷款仍然是 200。
- 有 DEFAULTED 贷款的借款人为 STANDARD。

---

## Phase 8 · 网站、README、demo 数据收尾（R3 网站、演示）

- 营销首页 `WhyUs` 或 `ProcessSteps` 里补三条卖点：`Text reminders before every repayment`、`Sign your loan contract online`、`Set up automatic repayments`。**不要改品牌名和法定实体名**；`apps/web/test/brand-copy.test.mjs` 必须仍然通过。
- `help.tsx` 的 FAQ 加 4 条：How do repayment reminders work? / How do I sign my contract online? / Can I pay automatically? / Do returning borrowers get a discount?
- `seed-demo-data.ts` 补齐：
  - 5 个存放位置（Phase 3），demo 资产分布在不同位置，其中 1 件有一次移库记录。
  - Sarah 的贷款有 ACTIVE 自动还款安排（Phase 6）。
  - Lisa Wong 已有 1 笔 SETTLED，另建一笔她的 SUBMITTED 新申请，演示 RETURNING 折扣。
  - Peter Ioane 的合同保持 ISSUED 待签（Phase 5）。
  - 跑一次 `RemindersService.runDue()`，让发件箱里有数据。
  - 以上都保持幂等。
- `README.md` 的 "What each login can do" 按新功能各补一句；再新增一段 "Client requirements coverage (Alice, 29 Sep)"，写成 R1–R6 对照表，每行一句话说明对应的功能和页面路径。这是评分人最先看到的地方。

**验收（全流程演示剧本，逐条走通并截图放进汇报）**
1. `valuation@toumua.nz`：`/staff/storage` → 看到位置和占用数 → 打开一件资产的 History。
2. `manager@toumua.nz`：审批 James Latu → `/staff/reminders` 点 Run → 看到发件箱。
3. 用 Peter 或 James 的客户账号：签合同。
4. `cashier@toumua.nz`：放款 → `/staff/collections` 入账 Sarah 的自动扣款 → 打开收据。
5. `sarah.tama@toumua.nz`：看贷款、提醒通知、自动还款卡片、已签合同下载。
6. `owner@toumua.nz`：业务状态卡片 + 员工账号管理可以进入。

---

## 不在本单范围（不要动）

- 接入真实的短信网关、银行 API、第三方电子签名服务。
- 合同条款的法律审阅，以及 CCCFA 合规文本（等 Min 和客户确认）。
- Alice 提到的 "角色以后再确认"：除 Phase 2 的 owner 可管理用户之外，不增删任何角色或权限。
- 利息和费用 schema 拆分（principal/interest、FEE 类型），沿用执行单 01 的排除项。
- 生产级加固（对象存储、加密静态存储、KMS、限流按 IP 等）。文件库只做到"私有目录 + sha256 完整性校验 + 访问审计"。
- 会议纪要、项目计划、图表。

---

## 汇报格式（完成后追加到本文件末尾的 "## 执行回报" 段）

每个 Phase 一行：`R-Phase N · DONE | BLOCKED | SKIPPED · commit <sha> · 一句话说明`。
BLOCKED 必须附上失败命令、错误输出的前 20 行，以及已尝试过的修法。
最后给出：分支名、PR 链接、`pnpm test:api` 与 `pnpm --filter @toumua/web test` 的最终结果（通过数和失败数），以及 Phase 8 演示剧本的 6 张截图路径。

## 执行回报

R-Phase 0 · DONE · commit 6e54412 · Reverted auth/resetDb test workarounds; local Docker Postgres in sheet; STAFF_APPROVE_LIMIT profile default in .env.example; vitest 30s (64/0/0 local, no retry/lock).
R-Phase 2 · DONE · commit 8724bf3 (API), 4c84468 (web/README/report line) · Owner staff API/guard/tests; OWNER staff-accounts nav, CARD option, README casing.
Branch: `agent/client-requirements` (no PR). Final `pnpm test:api`: 64 passed, 0 failed, 0 skipped (~50s local Docker). Final `pnpm --filter @toumua/web test`: 4 passed, 0 failed, 0 skipped.
R-Phase 3 · DONE · commit a67aadc, 387ea0d · Named storage locations, asset change history, and borrower on the collateral list; capacity row locks so two placements cannot overfill one slot. Isolated API tests 97 passed, 0 failed, 3 skipped; web tests 4 passed.
R-Phase 4 · DONE · commit 1e39bf0, f4519e6 · SMS reminders with a unique reminder row per installment. Demo dates come from the weekly terms saved at creation (David due today, Sione already overdue, Sarah's next unpaid installment due today); a re-seed does not rewrite schedule or ledger rows. Each run sends at most one OVERDUE text per loan, the oldest installment not yet reminded, and the next run the same day sends the next oldest. Isolated API tests 106 passed, 0 failed, 3 skipped; web tests 4 passed. Automatic-collection wording is left for Phase 6.
R-Phase 5 · DONE · commit f124c4b, f17bdd1 · Loan contracts are frozen at approval (rendered terms plus SHA-256). Signing records the borrower, method (portal or in-branch witness), Auckland time, IP/user-agent, the signature image and the signed HTML. A superseded or already-signed contract is refused, and two simultaneous signs succeed exactly once. Disbursement requires that current contract to be SIGNED. A manager can issue version 1 for an approved unfunded loan that has no contract (legacy rows), under a loan row lock, so two simultaneous issues create exactly one v1. Documents live under UPLOAD_DIR and are served only after an access check, with a hash check on download; stored HTML is sent with a sandbox content-security-policy. Isolated API tests 115 passed, 0 failed, 3 skipped; web tests 4 passed. The existing demo database was not backfilled (re-seed stayed a no-op; 0 contracts). A fresh seed signs already-disbursed loans through the services and leaves Peter Ioane's contract unsigned. No PDF library, no external e-sign provider. Automatic-collection wording remains Phase 6.
