import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { requestIdMiddleware } from "./common/request-id.middleware";

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    cors: false,
    abortOnError: false,
    logger: process.env.NODE_ENV === "test" ? ["error"] : ["error", "warn", "log"],
  });
  app.setGlobalPrefix("api/v1");
  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: process.env.PUBLIC_WEB_URL ?? "http://127.0.0.1:5173",
    credentials: true,
  });
  return app;
}
