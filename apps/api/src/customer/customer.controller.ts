import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emptyList } from "@toumua/contracts";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { forbidden, notFound } from "../common/http";
import { ApplicationsService } from "../lending/applications.service";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("customer")
@Controller("me")
export class CustomerController {
  constructor(
    @Inject(ApplicationsService) private readonly applicationsService: ApplicationsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get("loans")
  loans(@CurrentUser() user: AuthUser) {
    this.assertCustomer(user);
    return emptyList();
  }

  @Get("applications")
  applications(@CurrentUser() user: AuthUser) {
    this.assertCustomer(user);
    return this.applicationsService.listForCustomer(user.id);
  }

  @Get("applications/:id")
  application(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    this.assertCustomer(user);
    return this.applicationsService.getForCustomer(user.id, id);
  }

  @Get("loans/:id")
  loan(@CurrentUser() user: AuthUser, @Param("id") _id: string) {
    this.assertCustomer(user);
    throw notFound();
  }

  @Get("receipts/:id")
  receipt(@CurrentUser() user: AuthUser, @Param("id") _id: string) {
    this.assertCustomer(user);
    throw notFound();
  }

  private assertCustomer(user: AuthUser) {
    if (user.isStaff) {
      throw forbidden();
    }
    if (!user.emailVerified) {
      throw forbidden("Verify your email to continue");
    }
  }
}
