import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INestApplication } from "@nestjs/common";
import { normalizeSmsPhone } from "../src/sms/phone";
import { RemindersService } from "../src/reminders/reminders.service";
import { AuthService } from "../src/auth/auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  Agent,
  agentWithCsrf,
  post,
  resetDb,
  seedCashier,
  seedLoanOfficer,
  seedManager,
  startApp,
} from "./helpers";

const AS_OF = new Date("2026-06-01T00:00:00.000Z");

describe("repayment SMS reminders", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let loanOfficerId: string;
  let customerId: string;

  beforeAll(async () => {
    process.env.SMS_DRIVER = "memory";
    process.env.REMINDER_DAYS_BEFORE = "3";
    process.env.REMINDER_CRON_ENABLED = "0";
    ({ app, prisma, auth } = await startApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    loanOfficerId = (await seedLoanOfficer(prisma, auth)).id;
    await seedManager(prisma, auth);
    await seedCashier(prisma, auth);
    const ownerHash = await auth.hashPassword("Owner12345");
    await prisma.user.create({
      data: {
        email: "owner@example.com",
        emailNormalized: "owner@example.com",
        name: "Olivia Owner",
        passwordHash: ownerHash,
        role: "OWNER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: "borrower@example.com",
        emailNormalized: "borrower@example.com",
        name: "Bea Borrower",
        role: "CUSTOMER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    customerId = customer.id;
  });

  async function login(email: string, password: string): Promise<Agent> {
    const agent = await agentWithCsrf(app);
    const response = await post(agent, "/api/v1/auth/login", { email, password });
    expect(response.status).toBe(201);
    return agent;
  }

  async function installment(input: {
    tag: string;
    phone: string;
    due: string;
    smsOptIn?: boolean;
    loanStatus?: "ACTIVE" | "SETTLED";
    entryStatus?: "PENDING" | "PAID";
    link?: boolean;
  }) {
    const borrower = await prisma.borrower.create({
      data: {
        number: `BR-${input.tag}`,
        name: `Borrower ${input.tag}`,
        phone: input.phone,
        address: "1 Queen Street, Auckland",
        smsOptIn: input.smsOptIn ?? true,
      },
    });
    const application = await prisma.application.create({
      data: {
        number: `APP-${input.tag}`,
        borrowerId: borrower.id,
        createdById: loanOfficerId,
        status: "APPROVED",
      },
    });
    const dueDate = new Date(`${input.due}T00:00:00.000Z`);
    const loan = await prisma.loan.create({
      data: {
        number: `L-${input.tag}`,
        applicationId: application.id,
        borrowerId: borrower.id,
        status: input.loanStatus ?? "ACTIVE",
        principal: "120.00",
        frequency: "WEEKLY",
        periods: 1,
        firstPaymentDate: dueDate,
        policy: "test",
      },
    });
    const entry = await prisma.scheduleEntry.create({
      data: {
        loanId: loan.id,
        number: 1,
        dueDate,
        amount: "120.00",
        paidAmount: "0.00",
        status: input.entryStatus ?? "PENDING",
      },
    });
    if (input.link) {
      await prisma.borrowerAccountLink.create({
        data: {
          borrowerId: borrower.id,
          userId: customerId,
          status: "ACTIVE",
          verificationMethod: "test",
        },
      });
    }
    return { borrower, loan, entry };
  }

  it("normalizes a local New Zealand mobile number", () => {
    expect(normalizeSmsPhone("021 234 5678")).toBe("+64212345678");
  });

  it("sends a due-soon reminder once, including the in-app copy", async () => {
    await installment({ tag: "SOON1", phone: "021 234 5678", due: "2026-06-04", link: true });
    const manager = await login("manager@example.com", "Manager12345");

    const first = await post(manager, "/api/v1/reminders/run", { asOf: "2026-06-01" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ dueSoon: 1, dueToday: 0, overdue: 0, skipped: 0 });

    const reminder = await prisma.repaymentReminder.findFirstOrThrow({ include: { smsMessage: true } });
    expect(reminder.kind).toBe("DUE_SOON");
    expect(reminder.smsMessage?.status).toBe("SENT");
    expect(reminder.smsMessage?.body).toContain("repayment of $120.00 for loan L-SOON1 is due on Thu 4 Jun");
    expect(reminder.smsMessage?.body.length).toBeLessThanOrEqual(160);
    expect(reminder.smsMessage?.toPhone).toBe("+64212345678");

    const notice = await prisma.notification.findFirst({ where: { userId: customerId } });
    expect(notice?.body).toBe(reminder.smsMessage?.body);

    const audit = await prisma.auditEvent.findFirst({ where: { action: "reminder.send" } });
    expect(audit?.objectType).toBe("ScheduleEntry");

    const outbox = await manager.get("/api/v1/sms-outbox");
    expect(outbox.status).toBe(200);
    const serialized = JSON.stringify(outbox.body);
    expect(serialized).not.toContain("+64212345678");
    expect(serialized).not.toContain("021 234 5678");
    expect(outbox.body.items[0].phoneMasked).toBe("+64 21 *** 678");

    const second = await post(manager, "/api/v1/reminders/run", { asOf: "2026-06-01" });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ dueSoon: 0, dueToday: 0, overdue: 0, skipped: 0 });
    expect(await prisma.smsMessage.count()).toBe(1);
    expect(await prisma.repaymentReminder.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "reminder.send" } })).toBe(1);
  });

  it("ignores paid installments, opted-out borrowers, and settled loans", async () => {
    await installment({ tag: "PAID1", phone: "021 234 5678", due: "2026-06-04", entryStatus: "PAID" });
    await installment({ tag: "OPTOUT", phone: "021 111 2222", due: "2026-06-04", smsOptIn: false });
    await installment({ tag: "SETTLED", phone: "021 333 4444", due: "2026-06-04", loanStatus: "SETTLED" });
    const manager = await login("manager@example.com", "Manager12345");
    const response = await post(manager, "/api/v1/reminders/run", { asOf: "2026-06-01" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ dueSoon: 0, dueToday: 0, overdue: 0, skipped: 0 });
    expect(await prisma.smsMessage.count()).toBe(0);
    expect(await prisma.repaymentReminder.count()).toBe(0);
  });

  it("skips an invalid phone and still sends the other reminder", async () => {
    await installment({ tag: "BADPH", phone: "abc", due: "2026-06-01" });
    await installment({ tag: "GOOD1", phone: "021 234 5678", due: "2026-05-20" });
    const manager = await login("manager@example.com", "Manager12345");
    const response = await post(manager, "/api/v1/reminders/run", { asOf: "2026-06-01" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ dueSoon: 0, dueToday: 0, overdue: 1, skipped: 1 });

    const skipped = await prisma.smsMessage.findFirst({ where: { status: "SKIPPED" } });
    expect(skipped?.error).toBe("invalid phone");
    const sent = await prisma.smsMessage.findFirst({ where: { status: "SENT" } });
    expect(sent?.body).toContain("L-GOOD1");
    expect(sent?.body).toContain("overdue");

    const again = await post(manager, "/api/v1/reminders/run", { asOf: "2026-06-01" });
    expect(again.body).toEqual({ dueSoon: 0, dueToday: 0, overdue: 0, skipped: 0 });
    expect(await prisma.smsMessage.count()).toBe(2);
  });

  it("refuses a cashier run and hides the outbox from a loan officer", async () => {
    const cashier = await login("cashier@example.com", "Cashier12345");
    const denied = await post(cashier, "/api/v1/reminders/run", { asOf: "2026-06-01" });
    expect(denied.status).toBe(403);

    const readable = await cashier.get("/api/v1/sms-outbox");
    expect(readable.status).toBe(200);
    const owner = await login("owner@example.com", "Owner12345");
    expect((await owner.get("/api/v1/sms-outbox")).status).toBe(200);

    const officer = await login("loan@example.com", "LoanOfficer12");
    expect((await officer.get("/api/v1/sms-outbox")).status).toBe(403);
    expect((await post(officer, "/api/v1/reminders/run", {})).status).toBe(403);
  });

  it("keeps one reminder when the job runs twice at the same time", async () => {
    await installment({ tag: "RACE1", phone: "021 234 5678", due: "2026-06-04" });
    await installment({ tag: "RACE2", phone: "021 555 0199", due: "2026-06-01" });
    const reminders = app.get(RemindersService);
    const [first, second] = await Promise.all([reminders.runDue(AS_OF), reminders.runDue(AS_OF)]);
    expect(first.dueSoon + second.dueSoon).toBe(1);
    expect(first.dueToday + second.dueToday).toBe(1);
    expect(first.skipped + second.skipped).toBe(0);
    expect(await prisma.repaymentReminder.count()).toBe(2);
    expect(await prisma.smsMessage.count()).toBe(2);
    const kinds = await prisma.repaymentReminder.groupBy({ by: ["kind"], _count: { _all: true } });
    expect(kinds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "DUE_SOON", _count: { _all: 1 } }),
        expect.objectContaining({ kind: "DUE_TODAY", _count: { _all: 1 } }),
      ]),
    );
  });

  it("does not send from the morning cron while tests are running", async () => {
    await installment({ tag: "CRON1", phone: "021 234 5678", due: "2026-06-01" });
    process.env.REMINDER_CRON_ENABLED = "1";
    await app.get(RemindersService).tick();
    process.env.REMINDER_CRON_ENABLED = "0";
    expect(await prisma.repaymentReminder.count()).toBe(0);
  });

  it("sends one overdue text per loan per run, oldest first, then the next", async () => {
    const flood = await installment({ tag: "OD3", phone: "021 234 5678", due: "2026-05-01" });
    for (const [index, due] of ["2026-05-08", "2026-05-15"].entries()) {
      await prisma.scheduleEntry.create({
        data: {
          loanId: flood.loan.id,
          number: index + 2,
          dueDate: new Date(`${due}T00:00:00.000Z`),
          amount: "120.00",
          paidAmount: "0.00",
          status: "PENDING",
        },
      });
    }
    const other = await installment({ tag: "OD1", phone: "021 555 0199", due: "2026-05-20" });
    const reminders = app.get(RemindersService);

    const first = await reminders.runDue(AS_OF);
    expect(first).toMatchObject({ dueSoon: 0, dueToday: 0, overdue: 2, skipped: 0 });
    const firstBodies = (await prisma.smsMessage.findMany({ orderBy: { body: "asc" } })).map((row) => row.body);
    expect(firstBodies).toHaveLength(2);
    expect(firstBodies.some((body) => body.includes("L-OD3") && body.includes("1 May"))).toBe(true);
    expect(firstBodies.some((body) => body.includes("8 May") || body.includes("15 May"))).toBe(false);
    expect(firstBodies.some((body) => body.includes("L-OD1"))).toBe(true);

    const second = await reminders.runDue(AS_OF);
    expect(second).toMatchObject({ dueSoon: 0, dueToday: 0, overdue: 1, skipped: 0 });
    const secondMessage = await prisma.smsMessage.findFirst({
      where: { loanId: flood.loan.id, body: { contains: "8 May" } },
    });
    expect(secondMessage?.status).toBe("SENT");
    expect(await prisma.repaymentReminder.count({ where: { kind: "OVERDUE", scheduleEntry: { loanId: other.loan.id } } })).toBe(1);

    const third = await reminders.runDue(AS_OF);
    expect(third.overdue).toBe(1);
    expect(await prisma.smsMessage.count({ where: { loanId: flood.loan.id } })).toBe(3);

    const fourth = await reminders.runDue(AS_OF);
    expect(fourth).toEqual({ dueSoon: 0, dueToday: 0, overdue: 0, skipped: 0 });
    expect(await prisma.smsMessage.count()).toBe(4);
  });
});
