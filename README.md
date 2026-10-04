# 体育中心运动损伤应急处置报告系统

值班员接到现场求助后快速登记并派人，急救员在处置过程中补充记录，管理人员事后复盘整起事件。

- 后端：TypeScript + NestJS + Prisma + SQLite
- 前端：React + Vite
- 通知与急救机构回执：本地模拟接口（`/api/mock/*`）
- 附件：本地保存（`apps/api/uploads/`）

## 一条命令启动

```bash
npm install   # 首次
npm run dev   # 启动后端(3000) + 前端(5173)，自动建库、自动写入演示数据
```

打开 http://localhost:5173 即可使用。生产模式：`npm run build && npm start`，全部内容由 http://localhost:3000 托管。

## 演示账号（登录页点击即可登录）

| 姓名 | 角色 | 说明 |
| --- | --- | --- |
| 张伟 | 值班员 | 登记报警、误报/重复报警处理、交接 |
| 李婷 / 王强 | 急救员 | 抢单、现场评估、联系家属、转送 |
| 陈晨 | 急救员 | 不参与处置，用于演示查看权限 |
| 赵敏 | 管理人员 | 高风险事件复盘关闭 |

## 演示

```bash
npm run demo   # 需服务已启动
```

脚本依次演示：**多人同时抢单**（一人 201、其余 409）→ 换班交接 → 补充评估/联系家属/转送（约 3 秒后收到模拟急救机构回执）→ **更正留痕** → **查看权限**（未参与者看到脱敏数据）→ **事件升级**（值班员关闭被 403 拒绝，管理员复盘后关闭）→ 误报/重复报警留痕 → 打印**完整处置时间线**。

界面上也可以直接演示：开两个浏览器窗口分别登录李婷、王强，在值班屏同时点「立即接手」。

## 关键设计

- **快速报警**：报警表只填地点、发生时间、伤者基本情况与当前处置人（可留空待抢单），详细报告由急救员处置中补充。
- **唯一接手人**：抢单用一条带状态条件的原子 `UPDATE ... WHERE status='PENDING'` 实现，并发下只有第一人生效，其余返回 409，杜绝重复领取。
- **时间线**：报案、接手、评估、联系家属、转送、回执、交接、升级、关闭全部按时间落在同一事件上；误报/重复报警/换班/转院不另起记录，重复报警会在原事件追加合并备注。
- **更正留痕**：更正生成新记录并通过 `supersedesId` 指向原文，原文永不删除，界面上可展开查看。
- **查看权限**：伤者姓名、联系方式、评估/家属/转送记录、附件仅参与处置的人（报案人、历任处置人、管理员）可见，其他人看到脱敏数据。
- **升级与关闭**：高风险事件升级后，前台（值班员）不能关闭，只能由管理人员复盘后关闭。
- **本地模拟接口**：转送时生成 EMS 通知，约 3 秒自动回执并写入时间线；`GET /api/mock/notifications` 可查看全部模拟通知，`POST /api/mock/ems/:id/ack` 可手动触发回执。

## 目录结构

```
apps/api          NestJS 后端（prisma/schema.prisma 为数据模型）
  src/events      事件：报警/抢单/交接/升级/关闭/记录/更正/附件
  src/mock        本地模拟通知与急救机构回执
  src/auth        演示令牌认证
  src/seed.ts     首次启动写入演示账号与示例事件
apps/web          React 前端（值班屏 / 新报警 / 事件详情时间线）
scripts/demo.mjs  演示脚本
```

## 主要 API

```
POST /api/auth/login                     登录（演示）
POST /api/events                         值班员登记报警
GET  /api/events                         值班屏列表（按查看者脱敏）
GET  /api/events/:id                     事件详情 + 时间线
POST /api/events/:id/claim               抢单（原子，唯一接手人）
POST /api/events/:id/handover            交接/换班
POST /api/events/:id/escalate            高风险升级
POST /api/events/:id/close               关闭（高风险仅管理员）
POST /api/events/:id/entries             补充处置记录（转送触发模拟回执）
POST /api/events/:id/entries/:eid/correct 更正记录（保留原文）
POST /api/events/:id/attachments         上传附件（本地保存）
GET  /api/mock/notifications             查看模拟通知与回执
```
