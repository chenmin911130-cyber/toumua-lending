"""Generate the reviewable control contract; not application code or executed tests."""
from pathlib import Path
import json, csv

ROOT = Path(__file__).resolve().parent
# screen | visible control | authorized role | prerequisite / validation |
# behavior and target | observable acceptance
DATA = r'''
GLOBAL|品牌 Logo|全部|无|公开回 /；客户回 /customer；员工回 /staff|在三种外壳点击均进入正确首页
GLOBAL|客户导航 My overview / Application / Repayments / My security / Help|Customer|业务页需已验证并关联；无贷款时显示空状态|按路由表跳转；多笔贷款先选 loanId，不擅自默认另一笔|五个入口可键盘操作；选中状态随真实路由变化
GLOBAL|员工导航 Overview / Borrowers / Applications / Loans / Collateral / Transactions|Staff|按 IMPLEMENTATION_SPEC 权限矩阵|进入各资源列表；不可访问项不显示，直接输入URL仍鉴权|逐角色核对菜单及后端403/404；不会显示客户外壳
GLOBAL|Administration / Staff accounts / Activity log|manage_staff 或 view_audit|相应独立权限|打开管理子导航至S16/S19|只有相应授权项可见且API独立校验
GLOBAL|Settings / Your account|已登录|有效会话|进入A02；员工继续用员工外壳|角色只读，不存在自助提升权限控件
GLOBAL|头像 / 姓名 / 下拉箭头|已登录|有效会话|打开菜单含Your account、Sign out；外部点击或Esc关闭|焦点与键盘导航正确，菜单不遮住关键操作
GLOBAL|Sign out|已登录|提交中先说明尚未确认操作并保留服务端attempt|POST /auth/logout；清空受保护缓存后到C02|退出后后退及直接API均不能读取旧数据
GLOBAL|顶部放大镜 / Ctrl或Cmd+K|Staff|至少2字符；资源范围鉴权|打开全局搜索对话框，GET /search?q=；选择结果到对应详情|不同角色结果范围正确，旧响应不覆盖新输入
GLOBAL|全局搜索结果 / Enter|Staff|结果仍有权限且存在|进入结果记录；关闭搜索框|无权限或已删除记录给404安全页，不泄露摘要
GLOBAL|通知铃铛 / 未读数字|已登录|有效会话|GET /notifications，打开G02|未读数来自服务端；无通知为0而不是固定红点
GLOBAL|Back / 面包屑 / Return to overview|当前页访问者|未保存内容先处理脏表单；未知资金结果保留attempt|返回规范父路由，列表筛选保留；不依赖可能离开站点的history.back|新标签直接打开详情后返回仍正确
GLOBAL|Cancel / Close / X / Esc|当前页访问者|提交中不撤销已发送业务；未保存时提示|关闭抽屉或确认框；返回触发点|取消不产生API写入；焦点回触发控件
GLOBAL|Keep editing|表单操作者|脏表单离开提示|关闭提示保留表单全部未保存输入|输入仍在，当前路由不变
GLOBAL|Discard changes|表单操作者|脏表单离开提示|丢弃尚未保存部分并继续离开；不删除服务器草稿|已保存草稿仍能重新打开
GLOBAL|表内搜索框 / 搜索图标|列表访问者|q长度≤160；查询范围鉴权|按当前资源GET查询，防抖300ms并重置分页|输入后真实结果改变；清空回默认结果
GLOBAL|状态标签 / Status下拉 / Type下拉|列表访问者|值来自资源白名单|更新URL筛选及当前资源GET查询|列表、总数、选中标签一致
GLOBAL|Date range / 日期选择器|列表访问者|from≤to；按Auckland业务日|打开日期范围选择并提交查询；清空撤销范围|边界日记录正确，不以UTC午夜误删
GLOBAL|排序表头 / 上下箭头|列表访问者|只能选择后端允许排序字段|切换升降序并重置分页|跨页全局排序正确而非只排当前数组
GLOBAL|Previous / Next / 页码 / Page size|列表访问者|页大小20或50；不存在页禁用|按真实游标／页索引加载，保留筛选|无重复或漏页；末页Next禁用
GLOBAL|Clear filters|列表访问者|无结果或有活动过滤器|清空查询和过滤器，回第一页|输入和URL同步清空，重新查询
GLOBAL|表格行 / 右箭头 / View details|列表访问者|对象级权限|进入该行详情或抽屉，路由带真实ID|每一行打开自己的记录，不固定跳示例ID
GLOBAL|Tabs / 标签页|当前页访问者|标签本身可访问|更新tab查询，加载对应内容|刷新保留标签；键盘左右和Enter可操作
GLOBAL|Show password / Hide password / 眼睛图标|密码表单使用者|无|仅切换该字段可见性，不改值、不提交|各字段独立；aria-label随状态更新
GLOBAL|Select / 下拉箭头 / 清除选项|表单操作者|选项由后端或契约白名单提供|展开、选择、清除；必填项清除后报字段错误|鼠标键盘行为一致；不能注入不存在角色或ID
GLOBAL|Upload photos / 选择文件 / 重试上传|资产编辑者|JPEG/PNG≤10MB每张，每件≤10张；资产可编辑|POST /assets/:id/attachments；显示进度、失败、已上传；私有文件存储|伪扩展名与越权上传被拒绝，刷新可见已保存附件
GLOBAL|照片缩略图 / 放大 / 上一张 / 下一张|记录访问者|有该文件读取权限|GET /private-files/:id；打开图片查看器|跨客户文件ID不可访问；图集首尾按钮正确禁用
GLOBAL|Remove photo / 缩略图X|资产编辑者|草稿附件可解绑，已批准历史不可删|确认后DELETE /assets/:id/attachments/:fileId|取消无变化；已用于批准的照片历史仍可查看
GLOBAL|Retry / 重新加载|页面访问者|只重试读取或明确未提交的操作|重新执行失败GET；写入未知结果一律转G01|不产生第二笔交易；保留筛选与非敏感输入
GLOBAL|Print receipt / Print schedule|记录访问者|已记账回执／已批准计划且可访问|载入专用打印布局，再调用受控打印预览|打印无导航和内部备注，取消打印不改变数据
GLOBAL|Export CSV / Download export|授权员工|当前资源查询权限|GET /transactions/export（其他资源按契约）；服务端导出当前筛选|导出和筛选一致，公式前缀转义、无隐藏敏感字段
GLOBAL|Return to login / Session expired|需要登录的访问者|会话无效|到C02，returnTo只接受本站允许路由|重新登录不能被returnTo导向恶意外站
GLOBAL|Return to list / Record not found / Access denied|当前访问者|404/403|清除不可访问详情，回有权限的列表或首页|页面不残留前一客户敏感信息
GLOBAL|确认框 Back to edit|写操作操作者|尚未提交|关闭复核框保留字段和草稿；若已提交进入结果核查|不会误发写请求，不丢表单
C01|How it works|公开|无|滚动至首页流程锚点并聚焦标题|顶部与正文两个入口均有效
C01|My loan / View my loan / Log in|公开或Customer|未登录先认证|未登录到C02；登录客户到C03/C09|返回目标安全保存，员工不进入他人客户账户
C01|Contact / Contact us / Contact our team|全部|无|到C07联系区|所有重复CTA指向同一真实帮助页
C02|Log in|公开|邮箱合法、密码非空；服务端限流|POST /auth/login；客户无验证到A04、单笔C03、多笔C09、无关联C10；员工S01|错误凭证不泄露账户状态；成功后刷新仍登录
C02|Forgot password?|公开|无|到A01并可带用户主动输入的邮箱至表单内存|不将密码带入URL或日志
C02|Create an account|公开|无|到A03，注册身份固定Customer|客户端传Manager也不能创建员工
C02|Staff sign-in / Back to home|公开|无|员工入口 /staff/login；返回 /|员工登录页不出现员工自助注册
C03|View repayment plan|Customer|当前loanId归本人且已放款|进入C05 schedule|显示当前贷款计划且金额来自API
C03|Recent repayments View all / 行点击|Customer|本人贷款|View all到C05 history；行点击打开客户回执|回执ID对应点击行；其他用户ID被拒绝
C03|Your security View details|Customer|本人资产|进入C06对应资产／资产列表|不显示仓库具体位置和内部备注
C03|Loan selector / All loans|Customer|本人多笔贷款|打开C09或选择本人loanId，清空上一笔详情缓存|切换后余额、计划、资产全部一致，不混用
C04|Application selector / View application|Customer|只能本人已提交申请|GET /me/applications并进入选中进度|无申请显示空状态，草稿内部备注不可见
C04|Contact our team|Customer|无|到C07|已拒绝、待审批、已放款状态均可联系
C05|Upcoming schedule / Payment history|Customer|当前本人loanId|切换schedule/history并加载真实接口|还款后刷新历史和余额同步
C05|View receipt / Most recent receipt|Customer|本人已记账交易|GET /me/receipts/:id打开客户版S13|无记录禁用并说明；不显示其他贷款回执
C05|Contact our team|Customer|无|到C07|提供真实联系内容，未配置状态明确
C06|资产选择 / 图片 / Custody timeline|Customer|本人关联资产|资产选择更新详情；图片继承GLOBAL预览；时间线只读|已归还与已出售文本区分且无库位泄露
C06|Contact our team|Customer|无|到C07|归还等待状态也可进入联系说明
C07|FAQ问题 / 展开箭头|全部|无|切换对应答案，aria-expanded及面板关联|四个FAQ均能展开收起且键盘可用
C07|View my application|Customer或公开|公开需先登录；本人申请|到C04，无申请显示C04空状态|不生成新申请、不跳任意示例记录
C07|电话 / Email / 地址|全部|GET /public/contact有已核实配置|tel、mailto、经允许的地图URL；未配置显示说明文本而非假链接|不会拨打或邮件至示例联系人
C07|Back to my overview|Customer或公开|按会话区分|客户回C03/C09/C10；公开回C01|公开访问不陷入必须登录的返回死循环
C08|手机菜单 / Overview / Progress / Repayments / Help|Customer|与桌面相同权限|菜单打开关闭；底部导航到同业务路由；security与account在菜单可达|390px下每个入口可点击，无底栏遮挡
C08|View repayment plan / Latest repayment|Customer|本人贷款|复用C03/C05功能而非第二套模拟数据|手机与桌面同一ID和金额
C09|Active loans / Loan history|Customer|本人已关联borrower|GET /me/loans?status=active或history|两笔合计来自同一筛选；历史不混入活动总额
C09|View loan|Customer|行内loanId本人所有|到C03该贷款详情|两行各自打开，不固定第一笔
C09|View application progress|Customer|无|到C04选择申请|无申请仍有清楚空状态和联系入口
C10|Contact our team|已验证Customer|无关联／无贷款|到C07说明人工关联和共同申请|不把无关联显示成贷款余额0
C10|View application progress|Customer|本人关联范围|到C04或其空状态|没有数据时不展示虚构进度
S01|Review applications / Awaiting approval / View all applications|Manager；其他员工只读待办|对应列表权限|到S03待审核筛选；经理行到S06|卡片计数与列表总数同源
S01|申请行右箭头|相关员工|实际任务分配及角色权限|待估值到S05，经理待审到S06，草稿贷款专员到S04|不会让估值未完成的申请看似可批准
S01|Recent transactions View all / 行|财务读取角色|交易读取范围|到S13或对应交易回执|默认日期范围明确且非固定样例
S01|Outstanding balance / Active loans|有贷款读取权限|如设计为可点击必须显示链接样式|到S14对应筛选，聚合来自GET /dashboard|统计和列表计算口径一致；无数据不显示示例金额
S02|Add borrower|Loan officer|无|进入S20新增表单|成功后新客户出现在搜索结果
S02|Edit details|Loan officer|借款人存在且version有效|进入S20编辑，GET /borrowers/:id预填|只改选中客户；不会新增重复客户
S02|Start application|Loan officer|借款人必需资料完整|POST /applications含borrowerId后到S04|重复点击只创建一个草稿
S02|Details / Loans / View loan|读取角色|借款人／贷款范围权限|详情标签只读资料；Loans查询该borrower贷款；View loan到S08|多笔贷款全部可分页查看
S02|Link account / View linked account|Loan officer|借款人范围权限|进入S17并显示当前关联|不能仅匹配姓名就开放贷款数据
S03|New application|Loan officer|无|POST /applications创建草稿，进入borrower步骤|无客户时可新增再返回，草稿ID稳定
S03|草稿行 / Edit draft|Loan officer|DRAFT，版本未过期|到S04上次服务端保存步骤|重启浏览器仍能恢复已保存内容
S03|Awaiting valuation / Manager review / Decided|相应员工|筛选权限|查询估值维度／申请状态；Disbursed由关联贷款状态衍生|草稿显示修改时间而非假提交日期
S04|Borrower搜索 / Select borrower|Loan officer|已保存的有效borrower；同一草稿未提交|GET /borrowers?q=，PATCH /applications/:id保存borrowerId|切换borrower提示关联内容影响，刷新仍选中正确客户
S04|Add new borrower|Loan officer|无|打开S20，保存后返回当前草稿并选中|不会丢当前草稿
S04|Save draft|Loan officer|DRAFT；允许缺必填但已填数据合法|PATCH /applications/:id含expectedVersion|刷新恢复；409保留输入并说明有新版本
S04|Continue|Loan officer|当前步骤必填与格式正确|保存当前步骤后到下一步；字段错误聚焦首项|保存失败不跳步，已填信息不丢
S04|Back / 五步Step导航|Loan officer|离开脏表单先保存或确认；未提交|回前步／已访问步骤；跨步不绕过提交校验|最终review仍检查全部步骤
S04|Manage security assets|Loan officer|DRAFT|到S21 security步骤|当前申请ID保持不变
S05|Asset selector / Valuation photos|Valuation officer；相关员工只读|分配的估值任务|选择当前任务资产；上传继承GLOBAL且绑定估值版本|不把照片写到另一申请
S05|Save draft|Valuation officer|任务REQUESTED或IN_PROGRESS；已填合法|POST /valuations或PATCH /valuations/:id草稿|不显示Valuation completed，不开启审批资格
S05|Save valuation / Complete valuation|Valuation officer|金额、依据、日期、三方参与记录齐全|POST /valuations/:id/complete保存完整快照|缺任一参与者422；完成后申请readiness更新
S05|参与人选择 / Present记录|Valuation officer|人员属于正确角色；借款人为当前申请对象|表单记录实际参与人员、方式、时间，随估值保存|不是固定姓名或默认全部Present
S06|Application / Valuation / Repayment terms / History|Manager及允许只读员工|申请读取权限|加载提交快照与历史，标签不改状态|经理看到的版本与提交一致
S06|View details / Open repayment terms|Manager及允许只读员工|对应记录权限|打开S05或S15只读模式|审批中不能偷偷修改原条款
S06|Review checklist复选框|Manager|SUBMITTED且ready|本次复核确认；不代替服务器前置校验|未勾全禁用批准；API仍复核readiness
S06|Approve application|Manager|SUBMITTED、ready、已复核、expectedVersion|打开批准确认，展示金额、资产和计划摘要|尚未最终确认时没有审批写入
S06|Confirm approval|Manager|同上且快照未变|POST /applications/:id/decision decision=approve|一次决定、生成未放款贷款，不产生放款交易
S06|Decline / Confirm decline|Manager|SUBMITTED；拒绝原因必填1–1000；客户公开说明独立|打开拒绝理由表单，确认POST decision=decline|客户只看到公开说明；经理内部备注不外泄
S07|Receive security / 行进入入库|Valuation officer|批准关联贷款；资产未STORED/RETURNED/SOLD|打开入库抽屉，GET /assets/:id|列出收到、检查、位置三个条件
S07|Confirm intake|Valuation officer|收到日期、经办人、检查合格、符合估值记录、库位齐全|POST /assets/:id/intake带version|原子写入交接事件；放款条件即时反映
S07|检查不合格 / Report mismatch|Valuation officer|实际不符合；原因必填|保存inspection异常，资产保持待处理并通知贷款专员／经理|不能勾选不匹配仍完成合格入库
S07|Update storage / Update condition|Valuation officer|资产STORED；理由必填|PATCH /assets/:id/custody追加位置／检查事件|旧库位历史保留，客户界面不见库位
S07|Return security / Record sale|Valuation officer|服务器allowedActions允许|分别到S11/S12；不满足给禁用原因|非结清不可归还，非违约不可出售
S08|View repayment schedule / Account tabs|贷款读取角色|对应贷款权限|加载schedule、transactions、security、history|各标签同loanId，历史显示实际作者时间
S08|View application|贷款读取角色|关联申请可读|到S06只读或有权决策模式|资金已放出不能再显示批准按钮
S08|View asset / View all transactions|贷款读取角色|相应读取范围|到S07资产详情／S13限定loanId|返回贷款时保留标签
S08|Disburse loan|Cashier|APPROVED_UNFUNDED及所有资产条件满足|到S09；不满足显示原因及可读资产入口|经理不能调用此POST
S08|Record repayment|Cashier|已放款、无相关未决attempt、规则允许收款|到S10|已结清按钮不可用，原因明确
S08|Declare default / Confirm default|Manager|已放款；正式违约政策有效；原因和依据必填|复核后POST /loans/:id/default|逾期不自动违约；审计记录决定者和依据
S08|Settlement / Resolve sale balance|Manager审核、Cashier执行|已出售、收款已记账、差额政策有效|GET /loans/:id/quotes?type=settlement；显示差额及允许动作；复核POST settlement-actions|规则缺失显示待结算；不偷偷把欠款归零
S09|Review disbursement|Cashier|批准、收到、检查、存储、未放款；方式及日期合法|服务端预检与quote后打开复核面板|审批撤销／并发放款会被服务器拒绝
S09|Confirm disbursement|Cashier|quote及version有效；创建attemptId|POST /loans/:id/disbursements含Idempotency-Key|重复请求返回同交易与回执；贷款变ACTIVE一次
S09|Cancel / Back to edit|Cashier|尚未提交|取消回S08；编辑回录入表单|不记账；已提交超时必须走G01
S10|Loan选择 / Payment method / Received on|Cashier|选中可收款贷款；日期方式在政策范围|选贷款GET余额，改变金额或日期使旧quote失效|不能用旧贷款余额核算新贷款还款
S10|Review repayment|Cashier|金额>0、小数≤2位；规则支持部分/超额/提前与业务日期|GET /loans/:id/quotes?type=repayment并打开复核|展示服务端计算的分配与结余；不前端减法冒充
S10|Confirm repayment|Cashier|quote和version有效，无未决意图|POST /loans/:id/repayments含幂等key|余额、计划、账本、回执一次提交；超时转G01
S10|Back to edit / Cancel|Cashier|未提交|返回编辑／S08；更改后必须重新quote|不重用失效确认数据
S10|View receipt / Record another payment|Cashier|前笔已确认committed或明确rejected|回执到S13；新收款重新载入余额并生成新意图|pending时Record another payment禁用
S11|Borrower and asset checked复选框|Valuation officer|完成实际借款人、资产身份核对|记录核对方法及对象，影响review资格|未勾选不得最终归还
S11|Review return|Valuation officer|余额0、SETTLED、资产STORED、无更正/处置锁；交接信息齐全|服务端预检后显示资产、接收人和交接摘要|余额变化立即使确认资格失效
S11|Confirm return|Valuation officer|最新资格、version有效|POST /assets/:id/return|同资产仅一次归还；库存与客户时间线一致
S11|Back to asset|Valuation officer|脏表单保护|回S07详情|没有静默提交或丢失已保存交接记录
S12|Save draft|Valuation officer|DEFAULTED且资产仍可出售；已填字段合法|保存sale草稿 POST/PATCH /assets/:id/sale-draft|不标记SOLD，不产生资金流水
S12|Linked cashier receipt下拉|Valuation officer|仅同贷款、同处置、未被其他处置使用的sale receipt|GET /transactions?type=sale_proceeds&loanId=并选择或留待收款|金额/贷款不匹配禁止关联，不能用还款回执充当出售收入
S12|Review sale|Valuation officer|已违约、资产在库、买方/金额/日期资料齐全|预检后展示出售复核；无回执明确等待出纳收款|不把未收款销售显示为已结算
S12|Confirm sale|Valuation officer|version有效，未归还/出售|POST /assets/:id/sale；附可选有效receiptId|实物SOLD并保留审计；不自动冲减余额
S12|Record sale proceeds / Confirm sale receipt|Cashier|已有sale记录，金额匹配或政策允许的明确差异|复用S10录入/复核；POST /loans/:id/sale-receipts幂等记账|估值专员不能收款；超时走G01；余款/不足保持待处理
S13|交易行 / View receipt|交易读取角色|读取范围|GET /transactions/:id和/receipt打开抽屉|原交易与更正关联都可查，不能编辑原金额
S13|Print receipt / Close|交易读取角色|已记账回执|继承GLOBAL打印及关闭，客户使用客户版布局|回执信息与数据库一致，无内部备注泄露
S13|Request correction|Cashier|支持更正的已记账交易，无同笔待处理更正|打开S18申请表，显示原记录，只能填写替代值与理由|不出现直接Edit/Delete已记账操作
S13|Corrections / 更正状态链接|相关员工|更正读取权限|到S18列表或指定更正详情|原回执上可追溯更正编号
S13|Export transactions|财务读取角色|当前筛选及导出权限|继承GLOBAL导出GET /transactions/export|空结果导出带表头，范围与界面一致
S14|贷款行 / 状态标签 / 筛选|贷款读取角色|读取范围|到S08；筛选按active/overdue/default/settled分别查询|overdue不被当成default；0余额不自动等于资产已归还
S15|频率 / 首期日期 / 期数 / 利息方法 / 费率周期|Loan officer|DRAFT；只能选已批准政策允许值|编辑terms草稿；变更任一项使旧preview失效|没有政策显示未配置，不能默认图片利率
S15|Add fee|Loan officer|DRAFT；正式政策允许该费用|增加费用行，名称、金额、时点等必填|空行不能preview；禁止负数或未经政策允许的费用
S15|Edit fee / Remove fee|Loan officer|DRAFT；不是已批准快照|编辑费用／确认移除并失效旧preview|预览重新计算；历史批准费用不改变
S15|Preview schedule|Loan officer|政策、金额、周期、日期、期数和费用齐全|POST /applications/:id/schedule-preview|返回每期明细及总额，版本绑定输入，精度与日期边界可测试
S15|Save draft|Loan officer|DRAFT；已填合法|PUT /applications/:id/terms含version|刷新保存参数；未生成计划仍不能提交
S15|Continue|Loan officer|最新preview有效且已保存terms|保存并进入S22|修改费率后不能沿用旧preview继续
S16|Invite staff|manage_staff|有效管理权限|打开邀请抽屉|无临时密码字段，不创建公开管理员注册入口
S16|Send invitation|manage_staff|姓名、邮箱、角色有效；不能重复活跃邮箱|POST /staff含业务role；后端发激活邀请|创建invited而非active；邮件失败可重发且无假成功
S16|行菜单 / View details|manage_staff|对象存在|查看角色、状态、邀请时间及权限，不显示token|活动用户Resend invitation禁用
S16|Change role / Confirm role change|manage_staff|非自己提升权限；保留至少一名管理员；理由必填|PATCH /staff/:id/role并审计、撤销旧会话|旧token即刻不能执行原角色权限
S16|Manage permissions / Save permissions|manage_staff|仅manage_staff/view_audit；不能自我授权或移除最后管理员|PATCH /staff/:id/permissions；复核名单和理由|不会隐式赋予Manager或Cashier业务角色
S16|Deactivate / Confirm deactivation|manage_staff|非最后有效管理员；理由必填|PATCH /staff/:id/status inactive|即刻撤销会话；历史交易作者仍存在
S16|Reactivate / Confirm reactivation|manage_staff|inactive且角色权限合法；理由必填|PATCH /staff/:id/status active|必须重新登录；不恢复旧会话
S16|Resend invitation / Revoke invitation|manage_staff|invited且限流允许|POST /staff/:id/resend-invitation；撤销PATCH status=invitation_revoked|旧token失效；撤销后受邀人不能激活
S17|Search verified account / Search borrower|Loan officer|仅已验证且无冲突关联对象|GET /verified-accounts?q=或borrowers?q=，加载比对信息|不能列出密码和token；不自动根据同名关联
S17|Verification method / Notes / Confirm identity复选框|Loan officer|实际人工核对、notes必填|收集核对证据摘要，不上传额外证件号码|无核对方法或未勾选时Review link不可用
S17|Review link|Loan officer|账户已验证、borrower存在、双方无有效冲突关联|展示双边ID和姓名/邮箱确认对话框|复核期间后台关联变化会409
S17|Confirm link|Loan officer|同上，最新version|POST /borrowers/:id/account-link|刷新客户可看该borrower贷款；不看到其他borrower
S17|Revoke incorrect link / Confirm revoke|Manager|已有关系；理由必填；二次确认|POST /borrowers/:id/account-link/revoke|旧客户立即失去数据访问，关联历史保留
S18|New correction / Submit request|Cashier|原交易可更正；替代金额>0、理由必填；无重复pending|POST /corrections含originalTxnId/proposedValues|请求pending，余额尚未变化
S18|View original receipt|相关员工|原交易可读|打开S13只读原回执|任何审批状态都能追溯原交易
S18|Approve correction / Confirm approval|Manager|REQUESTED；不可自审；重算政策支持；版本有效|复核前后差异，POST /corrections/:id/decision approve|只变approved，不立刻记账
S18|Reject / Confirm reject|Manager|REQUESTED，拒绝理由必填|POST /corrections/:id/decision reject|余额不变，出纳看到拒绝原因
S18|Post correction / Confirm posting|Cashier|APPROVED，原交易仍可更正，相关资产未受不可逆交接影响|POST /corrections/:id/post含幂等key|冲正与替代原子提交，重复点击只产生一组更正
S18|更正列表状态 / 行入口|Cashier/Manager/Accountant有范围权限|有更正读权限|GET /corrections，选择进入详情|权限决定申请/审核/执行按钮而非图片固定按钮
S19|Action / Date / User或Record搜索|view_audit|权限和参数合法|GET /audit-events带筛选|审计总数分页正确，未授权用户403
S19|审计行 / Details|view_audit|事件可读|GET /audit-events/:id显示actor/time/before/after/reason|只读无删除编辑，不返回token密码
S19|View borrower / View related record|view_audit加目标读取权限|目标记录仍可读|跳目标详情；否则禁用并解释|审计权限不绕过业务记录权限
S20|Save borrower|Loan officer|姓名、电话、地址必填及长度规则；邮箱可选合法|POST /borrowers|生成ID并返回S02新记录或原申请，刷新可查
S20|Save changes|Loan officer|同上及expectedVersion|PATCH /borrowers/:id|旧值进审计；客户账户邮箱不被借款人邮箱编辑覆盖
S20|Cancel|Loan officer|脏表单保护|回来源详情／申请|取消不创建半成品借款人
S21|Add asset|Loan officer|DRAFT|打开空资产抽屉|名称描述状况字段完整、无自行输入估值金额
S21|Save asset|Loan officer|字段合法；当前申请DRAFT|POST /assets含applicationId|保存到该草稿，刷新存在，尚未估值明确提示
S21|Edit / Save changes|Loan officer|DRAFT；asset版本有效|PATCH /assets/:id；实质变更使估值失效|不能保留与新资产资料不一致的已完成估值
S21|Remove / Confirm remove|Loan officer|未提交、未入库、未绑定有效贷款|DELETE /applications/:id/assets/:assetId草稿关系|仅移除草稿关系，留历史审计，不删除已抵押实物
S21|View valuation|Loan officer只读/Valuation officer可编辑|当前资产估值范围|有估值打开S05；无估值显示未开始及Request valuation入口|不能显示假完成估值
S21|Request valuation|Loan officer|资产资料完整、borrower及拟定金额已保存|POST /applications/:id/valuation-request分配估值人员|估值人员收到任务；重复请求不重复创建
S21|Back / Save draft / Continue|Loan officer|继承S04；至少一件合法资产才能继续|保存后前后步骤跳转|资产抽屉未保存时先提示，申请ID保持一致
S22|Edit borrower / Edit loan / Edit security / Edit terms|Loan officer|DRAFT|返回对应step并定位字段|编辑后返回review重新加载readiness
S22|View valuation / View terms|Loan officer|相关数据可读|打开S05只读／S15预览|不让贷款专员完成估值或经理决定
S22|Readiness缺失项目链接|Loan officer|后端GET /applications/:id/readiness|跳至缺失字段或任务；政策未配置解释依赖|所有缺项可定位，不只有灰按钮
S22|Submit for review / Confirm submission|Loan officer|readiness全部满足、三方估值完整、terms及schedule版本一致|POST /applications/:id/submit；冻结快照|变SUBMITTED，重复提交不新建申请；后台再校验全部条件
S22|Back / Save draft|Loan officer|DRAFT|复用S04存草稿及返回terms|状态不会提前变SUBMITTED
A01|Send reset link|公开|邮箱合法；服务端限流|POST /auth/password/forgot，显示中性结果|存在/不存在邮箱提示一致；不能暴露用户资料
A01|Back to login / Contact our team|公开|无|分别到C02/C07|过期或发送失败后有可操作返回入口
A02|Update password|已登录|当前密码正确，新密码12–128字符且确认一致|POST /auth/password/change；撤销旧会话并回C02|错误密码失败不更改；成功后旧会话失效
A02|Contact our team / Back to overview / Sign out|已登录|对应共用权限|到C07／所属首页／POST logout|角色及账户邮箱在此只读，不混同借款人资料编辑
A03|Create account|公开|姓名、邮箱、密码、确认密码合法|POST /auth/register；身份固定Customer，建立受限待验证会话到A04|双击同邮箱不重复账户；不生成loan/application
A03|Log in / Back to home|公开|无|分别C02/C01|保留页面路由正确，不携带密码
A04|Resend verification email|待验证Customer|受限待验证会话；服务端retryAfter到期|POST /auth/email/resend；旧链接失效|按钮真实倒计时；发送失败不显示已发送
A04|Use a different email / Save email|待验证Customer|仅当前注册会话，邮箱合法且无冲突|打开邮箱编辑；POST /auth/email/change-pending；重发新链接|旧邮箱链接失效，新地址掩码正确
A04|Back to login|待验证或公开|无|到C02，可清除受限会话|未验证账号不能靠URL进客户数据页
A05|验证链接加载 / Retry verification|链接持有者|token有效、未过期；单次消费|显式POST /auth/email/verify token；呈现成功/已验证/过期/无效|GET页面本身不直接变更；重放不创建完整登录会话
A05|Continue to login / Back to login|全部|服务端验证结果已返回|到C02|成功不自动提升为登录会话
A05|Request a new link|过期或无效链接持有者|有待验证会话可直接重发，否则回登录取得受限会话|到A04或C02，继承发送限流|不凭不可信token开放任意邮箱修改
A05|Contact our team|全部|无|到C07|验证失败也能获得帮助
A06|Activate account|受邀员工|token有效，密码合法一致，invitation仍invited|POST /auth/invitations/accept；角色从服务端邀请读取|单次激活；客户端修改role无效；成功回staff/login
A06|Back to staff login / Request a new invitation|受邀人|邀请过期或撤销时不可激活|到staff/login；过期页说明联系管理员，到C07|不能自行续期或重新选择角色
A07|Reset password|重置链接持有者|token有效，新密码及确认合法|POST /auth/password/reset；失效token和所有旧会话|一次生效；旧密码失败、新密码成功
A07|Request a new link / Back to login|公开|重置成功／链接无效或过期|到A01／C02|无效链接不会泄露邮箱和用户资料
D01|Retry connection|员工桌面|断线或health失败；不写资金|GET /health并验证会话，加载当前服务端状态和unresolved attempts|断线恢复不自动新建资金交易
D01|Return to overview|员工桌面|可离开当前页；未决资金保留服务端记录|显示工作台壳及离线状态；恢复后查询真实数据|不显示过时缓存为当前余额
D01|原生最小化 / 最大化或还原 / 关闭|桌面用户|Electron窗口存在；脏表单提示|使用系统窗口行为；关闭不撤销已发送请求|重开后可查未决attempt，没有离线补发队列
G01|Check payment status|该意图操作者或授权出纳|attempt属于可访问范围|GET /payment-attempts/:id；pending继续、committed回原回执、rejected提示修复|未知/404绝不直接当成未记账
G01|View transaction history / Back to transactions|Cashier|对应贷款交易范围|到S13限定loanId并保留未决提醒|返回后仍可核查同attempt，不产生新key
G01|Record another payment|Cashier|前笔明确committed或rejected且业务允许|重新加载余额和新表单到S10|pending一直禁用且有原因
G01|Retry original attempt / 恢复核查|Cashier|服务器暂查不到结果；有原请求摘要|同key同body幂等恢复，不创建新意图|请求曾成功也只返回原交易；body变更409
G02|All / Unread|已登录|自己的通知|GET /notifications?read=all或false|切换后数量与列表一致
G02|View application / View correction / View asset|相应授权用户|目标当前仍可见|通知关联真实recordId路由，进入后按设计标已读|不能用通知链接绕过权限；目标不可用有返回
G02|Mark as read|通知接收者|本人通知|POST /notifications/:id/read|跨设备刷新保持已读，未读数量减少一次
G02|Mark all as read|通知接收者|本人当前可见通知范围|POST /notifications/read-all带截止时间|请求期间新增通知不被误标已读
'''

items=[]
counters={}
for raw in DATA.strip().splitlines():
    parts=raw.split('|')
    assert len(parts)==6, (len(parts),raw)
    screen,label,role,validation,action,acceptance=parts
    counters[screen]=counters.get(screen,0)+1
    ident=f'{screen}-{counters[screen]:02d}'
    items.append(dict(id=ident,screen=screen,control=label,role=role,
        preconditions_and_validation=validation,action_and_target=action,
        success=acceptance,
        failure='遵循 IMPLEMENTATION_SPEC §4/§6：字段422就地提示、409保留输入并刷新比对、401重新登录、403/404不泄露记录、429按服务器等待、读取失败可重试；资金写入结果不明进入G01。',
        acceptance_test_id='CTL-'+ident,
        acceptance=acceptance,
        implementation_status='not_implemented',implementation_refs=[],
        test_status='not_run',test_refs=[]))

manifest=json.loads((ROOT/'manifest.json').read_text())
assert {s['id'] for s in manifest} <= set(counters)
(ROOT/'controls.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
with (ROOT/'controls.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(items[0])); w.writeheader(); w.writerows(items)

intro=f'''# V2 全按钮与交互清单

当前共 **{len(items)} 项交互定义**，覆盖全部42张页面及共用控件。多个同义入口或重复按钮可在一项中列出，但每个实际入口都要验证。所有项目当前均为 **not_implemented / not_run**。

`controls.json` 是机器可读交付；`controls.csv` 可用于任务看板。每个ID的验收项使用 `CTL-<ID>`，Cursor填写实现路径和测试路径，不能凭目测标为通过。清单是目标需求，不是自动生成的“测试已通过”报告。

## 适用规则

- 每个页面继承所有适用 GLOBAL 项：导航、搜索、筛选、分页、标签、弹窗、关闭、返回、密码可见性、上传、打印、错误等；图里相同动作无需重复写相同逻辑。
- 只读表格文字、状态徽章、时间线、静态卡片不是按钮；若实现为链接必须按对应跳转条目执行。图中生成偏差不构成新增角色或政策。
- 所有按钮同时考虑可见、可用、处理中、成功、明确失败、结果未知状态。禁用必须有文字原因，不能一直禁用当作实现。
- 前后端都做权限和状态校验。所有写入成功以服务端持久化为准，刷新可验证。
- 业务规则未确定导致的阻塞需要在 DECISIONS.md 和实现状态报告记录，不能伪造计算结果。
- 此脚本只用于最初生成设计清单；Cursor开始填写状态后不要重新运行覆盖进度。

'''
blocks=[intro]
for screen in counters:
    title='全局复用控件' if screen=='GLOBAL' else next(s['title'] for s in manifest if s['id']==screen)
    blocks.append(f'## {screen} · {title}\n\n')
    for x in [x for x in items if x['screen']==screen]:
        blocks.append(f"### {x['id']} · {x['control']}\n\n- **权限：** {x['role']}\n- **条件／校验：** {x['preconditions_and_validation']}\n- **动作／目标：** {x['action_and_target']}\n- **验收（{x['acceptance_test_id']}）：** {x['acceptance']}\n- **异常：** {x['failure']}\n\n")
(ROOT/'BUTTON_FUNCTIONS.md').write_text(''.join(blocks))
print(f'Generated {len(items)} control definitions; {len(counters)-1} screens; tests NOT RUN.')
