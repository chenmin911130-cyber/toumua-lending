import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  createApplicationSchema,
  cursorListQuerySchema,
  patchApplicationSchema,
  saveAssetSchema,
  saveTermsSchema,
} from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApplicationsService } from "./applications.service";
import { ValuationsService } from "./valuations.service";

const submitSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

@ApiTags("applications")
@RequireStaff()
@Controller("applications")
export class ApplicationsController {
  constructor(
    @Inject(ApplicationsService) private readonly applicationsService: ApplicationsService,
    @Inject(ValuationsService) private readonly valuationsService: ValuationsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(cursorListQuerySchema)) query: unknown,
  ) {
    return this.applicationsService.list(user, query as never);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createApplicationSchema)) body: unknown,
  ) {
    return this.applicationsService.create(user, (body as { borrowerId?: string }).borrowerId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.applicationsService.get(user, id);
  }

  @Get(":id/readiness")
  readiness(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.applicationsService.getReadiness(user, id);
  }

  @Patch(":id")
  patch(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(patchApplicationSchema)) body: unknown,
  ) {
    return this.applicationsService.patch(user, id, body as never);
  }

  @Put(":id/terms")
  saveTerms(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveTermsSchema)) body: unknown,
  ) {
    return this.applicationsService.saveTerms(user, id, body as never);
  }

  @Post(":id/schedule-preview")
  schedulePreview(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveTermsSchema)) body: unknown,
  ) {
    return this.applicationsService.schedulePreview(user, id, body as never);
  }

  @Post(":id/submit")
  submit(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitSchema)) body: unknown,
  ) {
    return this.applicationsService.submit(
      user,
      id,
      (body as { expectedVersion: number }).expectedVersion,
    );
  }

  @Post(":id/assets")
  addAsset(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveAssetSchema)) body: unknown,
  ) {
    return this.applicationsService.addAsset(user, id, body as never);
  }

  @Patch(":id/assets/:assetId")
  updateAsset(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
    @Body(new ZodValidationPipe(saveAssetSchema)) body: unknown,
  ) {
    return this.applicationsService.updateAsset(user, id, assetId, body as never);
  }

  @Delete(":id/assets/:assetId")
  deleteAsset(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
  ) {
    return this.applicationsService.deleteAsset(user, id, assetId);
  }

  @Get(":id/valuations")
  valuations(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.valuationsService.listForApplication(user, id);
  }

  @Post(":id/valuation-request")
  valuationRequest(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(z.object({ valuationOfficerId: z.string().min(1) }))) body: unknown,
  ) {
    return this.valuationsService.request(
      user,
      id,
      (body as { valuationOfficerId: string }).valuationOfficerId,
    );
  }
}
