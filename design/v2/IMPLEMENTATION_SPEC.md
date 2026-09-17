# Toumu’a V2 实现规范

2026-09-16。本文为工程设计，不是法律、会计或贷款政策建议。沿用已确认的用户需求；新增体验和技术约定是设计决策。现有数据库尚未读取。

## 1. 优先级与范围

用户明确要求 > 本文及按钮清单 > V2 页面说明 > 图片。图片里角色、导航、文案若有生成差异，使用本文；不要把示例数据当成真实数据。V1 中“可移除通知”“打印可选”在 V2 被替代：通知、搜索、打印必须实现。账户管理、关联、更正、审计为闭环设计补充，不声称原 PDF 逐项规定。

客户可注册、验证、登录、查看本人多笔贷款／申请／计划／回执／抵押品，联系员工。申请由员工与借款人共同完成；不提供客户在线申请、预约系统、在线支付或聊天。员工端与 Electron 完成办公室业务；Electron 复用员工 UI/API，不保存离线资金队列。全部可见控件必须有行为，明确禁用条件的控件除外。

## 2. 路由与页面

| 页面 | 规范路由 | 说明 |
| --- | --- | --- |
| C01 | `/` | 公开网站 |
| C02 | `/login`、`/staff/login` | 邮箱密码；身份由服务端决定 |
| C03/C08 | `/customer`、`/customer/loans/:loanId` | 单笔详情；多笔默认 C09；C08 是响应式 |
| C04 | `/customer/applications`、`/customer/applications/:id` | 列表选择＋进度；仅关联借款人的已提交申请 |
| C05 | `/customer/loans/:loanId/repayments?tab=schedule|history` | 计划与回执历史 |
| C06 | `/customer/loans/:loanId/security/:assetId?` | 资产列表及详情 |
| C07 | `/help` | 公开／客户相应页头 |
| C09/C10 | `/customer/loans` | 多笔列表／无关联状态 |
| S01 | `/staff` | 角色工作台 |
| S02/S20 | `/staff/borrowers`、`/staff/borrowers/:id`、`/staff/borrowers/new`、`/staff/borrowers/:id/edit` | 客户资料 |
| S03 | `/staff/applications` | 列表 |
| S04/S21/S15/S22 | `/staff/applications/:id/edit/:step` | borrower、loan、security、terms、review 五步骤 |
| S05 | `/staff/applications/:id/valuation` | 估值及参与记录 |
| S06 | `/staff/applications/:id/review` | 决策／只读记录 |
| S07 | `/staff/collateral`、`/staff/collateral/:id` | 入库抽屉、库存详情 |
| S08/S14 | `/staff/loans/:id`、`/staff/loans` | 详情／列表 |
| S09/S10 | `/staff/loans/:id/disbursement`、`/staff/loans/:id/repayment` | 录入→复核→提交→回执 |
| S11/S12 | `/staff/collateral/:id/return`、`/staff/collateral/:id/sale` | 归还／出售 |
| S13 | `/staff/transactions`、`/staff/transactions/:id` | 查询、回执及导出 |
| S16 | `/staff/admin/accounts` | 邀请与账户权限管理 |
| S17 | `/staff/borrowers/:id/account-link` | 人工核对关联 |
| S18 | `/staff/corrections`、`/staff/corrections/:id` | 申请列表／审核／记账 |
| S19 | `/staff/admin/activity` | 只读审计 |
| A01/A07 | `/forgot-password`、`/reset-password` | 请求邮件／新密码 |
| A02 | `/account` | 资料只读、修改密码、退出 |
| A03/A04/A05 | `/register`、`/verify-email/pending`、`/verify-email` | 注册／等待／验证结果 |
| A06 | `/accept-invitation` | 受邀员工激活 |
| G01 | `/staff/payment-attempts/:id` | 结果未知与核查 |
| G02 | `/notifications` | 权限范围内的通知；客户使用客户外壳 |
| D01 | Electron 当前页的断线覆盖层 | 重连后返回原路由或 G01 |

深链接刷新可用。返回列表保留查询参数，默认不保留敏感表单内容至 localStorage。公开链接 token 读取后从地址栏移除，日志与分析工具不得记录 token。

## 3. 权限矩阵

所有判断同时在 API 执行；隐藏按钮不是权限控制。默认拒绝未列出的权限。

| 角色 | 读取范围 | 写操作 |
| --- | --- | --- |
| Customer | 当前账户关联 borrower 的已提交申请、贷款、客户版资产与回执 | 自己的认证流程和密码；无业务写入 |
| Loan officer | 借款人、申请、条款、估值摘要、关联贷款 | 资料维护、账户关联、草稿、提交、条款准备、发起估值 |
| Valuation officer | 分配的估值任务、相关借款人必要资料、资产及对应贷款处置资格 | 估值、入库、位置／检查更新、归还、出售资料 |
| Manager | 全部业务记录 | 申请决定、违约决定、更正审核、错误账户关联撤销 |
| Cashier | 借款人必要身份、批准条件、贷款、资产资格、交易 | 放款、还款、出售收款、差额处理（有正式规则时）、更正申请与执行 |
| Accountant | 贷款和财务流水／回执／更正只读 | 无业务资金写入 |
| Owner | 工作台、贷款和财务概况只读 | 无审批、出纳写入 |

独立权限：`manage_staff`（S16）、`view_audit`（S19）。这两项不自动授予资金权限。初始账户管理员通过一次性部署配置创建，不能公开注册。管理员不能给自己增加业务角色，不能删除／停用最后一名有效账户管理员。调整角色须二次确认、理由与审计，立即撤销旧会话；现有借款和审批记录的作者不被更名覆盖。默认一名员工一个业务角色，可另有管理／审计权限；多角色扩展需显式设计职责冲突。

员工查询受行级访问范围限制。无权限对象返回不透露存在性的 404；已知模块无权限可返回403。关联撤销后，客户下一次请求立即失去该 borrower 数据访问；清空对应客户端缓存。

## 4. 表单与复用组件

### 字段约定

- 系统 ID、作者、操作时间由后端生成；金额使用十进制字符串和 PostgreSQL numeric，禁止 JS 浮点直接算钱。
- 借款人：姓名1–160字、电话1–40字、地址1–500字必填；称呼≤80、邮箱≤254、内部备注≤2000可选。这是 UI 实施基线，需和现有 schema 映射，不增加未确定的身份证件采集。
- 申请：borrowerId、金额>0且小数≤2位、用途1–200、说明≤2000、拟定期限正整数及单位。正式额度与期限边界由政策提供。
- 资产：名称1–160、描述1–2000、状况必填；种类、识别码可选。照片 JPEG/PNG、每张≤10MB、每件最多10张；服务端检查实际文件类型，剥离定位元数据，私有存储及授权读取。
- 估值：各资产金额>0、估值日期、依据1–2000、借款人参与记录、贷款专员与估值专员 ID、参与时间必填；不以勾选替代实际记录。估值版本随资产实质变更失效。
- 入库：收到日期、检查结果、存储位置、经办人；检查不合格必须留原因且不可放款。位置只对授权员工开放。
- 资金：金额、业务日期、方式、外部参考（该方式需要时）、备注；现金方式可无外部参考。对不支持的方式不出现伪入口。放款金额来自批准条款不可随意编辑。
- 归还：接收人、核对方法、日期、状态说明、交接备注；全部资产分件归还，未归还资产不能消失。
- 出售：买方姓名／联系资料、成交金额、日期、方式、处置说明；收款独立由出纳记账。正式差额政策缺失则保留“待结算”。
- 密码采用本项目基线12–128字符，支持空格、粘贴和密码管理器，确认值一致；不擅自 trim 密码。不声称这是客户正式安全政策。原密码错误需明确通用错误且限流。

### 复用交互

- Drawer / Dialog：标题、关闭、Cancel；Esc关闭非提交态；打开后焦点进入，Tab不离开，关闭回触发按钮；脏表单显示 Keep editing / Discard changes。Discard只丢弃未保存部分。
- 搜索／筛选／日期／排序／分页：通过真实 API 查询，URL保存非敏感筛选；变化回第一页，页大小20/50；搜索防抖300ms，旧响应不得覆盖新查询；无结果可 Clear filters。
- 全局搜索：点击放大镜或 Ctrl/Cmd+K 打开；输入至少2字符，按借款人／申请／贷款／资产／交易分组；结果仅权限范围；键盘上下选择、Enter进入、Esc关闭，零结果不是错误。
- 通知：业务事件生成、按用户分发；未读数量来自 API；点击目标重新鉴权。修改已读不修改业务状态。支持单条和全部已读、分页；未读列表清空显示 All caught up。无权限目标显示不可用并可返回。
- 表单提交：客户端提示＋服务端最终校验；按钮显示处理中，失败保留非敏感输入；422定位字段、409提示刷新比对；未确认事务结果进入G01。
- 打印：只打印回执／当前批准计划，不含导航、输入控件、内部备注；使用浏览器打印预览，Electron相同内容调用受控打印；取消不修改业务数据。
- CSV 导出：当前筛选的授权结果，由服务器生成；明确记录条数和生成时间；转义公式前缀，下载失败可重试。不能导出数据库全表或隐含隐藏字段。
- 资产图片：点击打开缩放预览，上一张／下一张／关闭；删除仅是可编辑草稿的附件解绑，保留已用于审批的历史快照。
- 手机：客户全部页面可在390px宽操作；导航折叠菜单、表格转卡片、抽屉全屏。C08不是另一套业务逻辑。

## 5. 状态机和前置条件

### 申请与估值

申请 `DRAFT → SUBMITTED → APPROVED | DECLINED`。提交后只读；本版不静默退回草稿。拒绝后如重新申请，创建新的草稿并引用旧记录，重新估值／审批，不复用旧批准。

估值任务 `REQUESTED → IN_PROGRESS → COMPLETED`。可在草稿阶段独立推进；“待估值”是估值维度，不是伪造的申请审批结果。提交需：borrower、贷款字段、资产、三方参与估值、有效条款与计划均完整，并保存版本号。经理决定使用该快照；陈旧版本409。审批后形成 `APPROVED_UNFUNDED` 贷款，并冻结条款。

### 贷款与抵押品

- 贷款 `APPROVED_UNFUNDED → ACTIVE → SETTLED`；ACTIVE可由经理有依据地标为DEFAULTED。`OVERDUE`是根据实际应还计划计算的提示，不自动触发DEFAULTED。
- 抵押品 `PROPOSED → VALUED → STORED → RETURNED | SOLD`；入库中的 received/inspected/stored是分别记录的条件。所有 required 资产完成后，才开放放款。
- 放款只有Cashier能记账，需批准＋必要资产接收检查存储完成＋未放款；数据库唯一约束保证一笔贷款一次放款。
- 还款必须已放款且允许收款；资金分配和结清判断由正式计算政策执行。余额0且无待处理资金事件才可结清；政策不支持的超额、回溯、提前还款必须显示原因。
- 归还须结清、资产仍在库、无相关待审／待记账更正和处置锁。后端原子检查，不能先前端验证后无条件写入。
- 违约由经理记录日期、依据、原因；估值专员在已违约且可出售时记录出售。出纳对出售收入入账。资产可标SOLD但贷款保持待差额处理，不自动免除不足额或吞掉多余款。
- 若正式政策允许不足继续欠款／豁免或多余款退还，需依据批准政策生成独立结算动作和审计；未确定前动作不可执行，明确列为外部依赖。

### 交易更正

`REQUESTED → APPROVED | REJECTED → POSTED`（仅APPROVED可POSTED）。出纳提交理由和替代值，经理独立审批，再由出纳原子生成原交易冲正＋替代交易。原交易不可覆盖或删除，原回执标注已更正并链接新记录。已有后续交易时重算须基于已批准的重算政策和版本；已归还／出售资产或影响已结清业务时进入需处理状态，不能自动撤销实物交接。管理批准本身不记账。

### 资金幂等及未知结果

每次资金意图生成唯一 attemptId／Idempotency-Key。服务端持久化请求摘要和状态，同键同请求返回相同结果，同键不同请求409。账本、余额、回执、审计以及事件发送记录在同一事务提交。资金输入变更必须创建新的意图，未解决意图不允许新建重复交易。

超时是 UNKNOWN，不是 FAILED。GET attempt 返回 pending/committed/rejected：committed显示原回执；pending继续核查；rejected且明确未提交才允许修正／重试。404不表示未记账；使用原key恢复查询或原请求幂等重放，不能换key盲重试。Electron重启后通过服务端查询当前操作者未决意图，禁止凭本地断线判断成败。

## 6. 目标 API 契约

统一前缀 `/api/v1`。详细动作与参数见 controls.json。以下为要实现的目标，实际代码须生成 OpenAPI 并与现有 schema 映射。

- Auth：register、login、logout、me、email/verify、email/resend、email/change-pending、password/forgot、password/reset、password/change、invitations/inspect、invitations/accept。
- Staff：GET/POST staff；PATCH staff/:id/role、/permissions、/status；POST staff/:id/resend-invitation。
- Borrowers：GET/POST borrowers；GET/PATCH borrowers/:id；GET verified-accounts；GET/POST borrowers/:id/account-link；POST account-link/revoke。
- Applications：GET/POST applications；GET/PATCH applications/:id；POST applications/:id/valuation-request、/submit、/decision；GET readiness；GET/PUT terms；POST schedule-preview。
- Assets：GET/POST assets；GET/PATCH assets/:id；POST assets/:id/attachments、/intake、/return、/sale；DELETE draft attachment link；POST valuations、PATCH draft valuations/:id、POST valuations/:id/complete。
- Loans：GET loans、loans/:id、/:id/schedule、/:id/history；POST loans/:id/default；POST loans/:id/disbursements、/:id/repayments、/:id/sale-receipts；GET quotes、POST settlement-actions（只有正式政策支持时）。
- Transactions：GET transactions、transactions/:id、transactions/:id/receipt、transactions/export；POST corrections；GET corrections、corrections/:id；POST corrections/:id/decision、/:id/post；GET payment-attempts/:id、payment-attempts?status=unresolved&mine=true。
- Customer：GET me/loans、me/applications、me/loans/:id、/:id/schedule、/:id/transactions、/:id/assets、me/receipts/:id；禁止将staff响应仅在前端删字段后充当客户接口。
- Common：GET search、notifications、audit-events、audit-events/:id、public/contact、health；POST notifications/:id/read、notifications/read-all；GET private-files/:id（鉴权）。

列表查询：`q,status,from,to,sort,cursor,limit`按资源白名单支持；响应`{items,nextCursor,total}`。详情包含`id,version,allowedActions`及禁止原因。变更提交`expectedVersion`；金额以`"250.00"`返回。日期业务字段`YYYY-MM-DD`，事件时间ISO UTC，显示转换Auckland。除明确写操作外，GET无业务副作用。

错误：`{code,message,fieldErrors?,requestId,retryAfterSeconds?}`；401会话、403权限、404不存在或不可见、409版本／状态冲突、422字段或政策条件、429限流、503服务不可用。日志只记requestId和安全摘要，不能暴露密码、token和完整金融个人资料。

## 7. 逻辑数据模型（不是现有表结构）

| 实体 | 关系／关键约束 |
| --- | --- |
| User / Session / VerificationToken / Invitation | 标准化邮箱唯一；密码哈希；token哈希、过期、已使用；停用立即撤销会话 |
| StaffPermission | userId＋permission唯一；业务角色独立 |
| Borrower / AccountLink | 一个客户账户最多一个有效borrower关联，一个borrower最多一个有效客户账户；可多笔贷款；关联历史保留 |
| Application / ApplicationRevision | borrowerId；草稿version；提交快照；decision作者和时间 |
| Asset / AssetAttachment / Valuation / Participation | 资产与申请／贷款关系；估值版本及三方参与；同件资产不能同时给两笔未结清贷款重复质押 |
| CustodyEvent / ReturnRecord / SaleRecord | 不可抹除的交接链、库位、人员、时间 |
| PolicyVersion / TermsSnapshot / ScheduleEntry | 计算政策可追溯，批准时冻结；开发测试政策明确标识 |
| Loan / LedgerEntry / PaymentAttempt / Receipt | 贷款来自唯一获批申请；精确金额；幂等key唯一；回执唯一 |
| CorrectionRequest / CorrectionPosting | 原交易引用、替代数据、审批与执行分离；一次执行 |
| AuditEvent / Notification / OutboxEvent | 业务事务同步记录；通知可异步分发且去重；审计不可通过UI编辑 |

真实库检查完成后逐项给出已有表／列映射、缺失约束及迁移计划。已有数据不得直接替换为示例。附件不能只写在临时容器磁盘；选择持久化私有对象存储或现有持久存储适配器。

## 8. Web、后端、桌面和邮件

React/Vite TS作为拟定实现基线，API采用NestJS TS，Electron主进程最小化，渲染层复用员工应用。依赖版本在工程启动时查官方资料并锁定，本设计不指定未验证的最新版。

Web通过同源API代理或明确允许的HTTPS源访问；服务端会话使用HttpOnly Cookie，配置CSRF保护和准确CORS。Electron采用受限来源、contextIsolation、sandbox、关闭nodeIntegration、窄IPC白名单；主进程不暴露任意shell或数据库凭据。会话策略需在打包环境做真实跨端验证。

注册、重置、邀请邮件通过后端邮件适配器与可靠队列发出；开发环境使用本地邮件收件箱。provider接受发送才显示“已发送”，队列中显示“发送中”；不等于保证到达。生产sender域名及地址未提供时，不假发邮件成功。验证24h、重置30min、邀请72h为本项目可配置默认值，重发旧token失效，所有token单次使用；重发最少60s间隔且服务端限流。

## 9. 完成边界

42张设计图覆盖主要页面与关键状态；编辑、确认、空状态、错误、搜索和打印采用本文定义的复用布局，不把每种排列都单独导出PNG。业务代码、API、数据库连接、邮件发送、测试执行和生产部署仍需Cursor实现并验证。正式计算规则与实际schema是明确依赖，不能由设计图推断。
