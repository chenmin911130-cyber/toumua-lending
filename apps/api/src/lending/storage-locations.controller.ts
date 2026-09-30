import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  storageLocationListQuerySchema,
  storageLocationSchema,
  storageLocationUpdateSchema,
} from "@toumua/contracts";
import { RequireStaff } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/session";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StorageLocationsService } from "./storage-locations.service";

@ApiTags("storage-locations")
@RequireStaff()
@Controller("storage-locations")
export class StorageLocationsController {
  constructor(
    @Inject(StorageLocationsService) private readonly locations: StorageLocationsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(storageLocationListQuerySchema)) query: unknown,
  ) {
    return this.locations.list(user, query as never);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.locations.get(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(storageLocationSchema)) body: unknown,
  ) {
    return this.locations.create(user, body as never);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(storageLocationUpdateSchema)) body: unknown,
  ) {
    return this.locations.update(user, id, body as never);
  }
}
