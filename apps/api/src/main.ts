import "reflect-metadata";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { createApp } from "./create-app";

function docsEnabled() {
  if (process.env.ENABLE_API_DOCS === "1") return true;
  if (process.env.ENABLE_API_DOCS === "0") return false;
  return process.env.NODE_ENV !== "production";
}

async function bootstrap() {
  const app = await createApp();
  if (docsEnabled()) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Toumu’a API")
        .setDescription("Local API docs. Not a production funds system.")
        .setVersion("0.1.0")
        .build(),
    );
    SwaggerModule.setup("api/docs", app, document);
  }
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  const host = process.env.NODE_ENV === "test" ? "127.0.0.1" : "0.0.0.0";
  await app.listen(port, host);
}

void bootstrap();
