import "reflect-metadata";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { createApp } from "./create-app";

async function bootstrap() {
  const app = await createApp();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("Toumu’a API")
      .setDescription("Batch 01–02 local API. Not a production funds system.")
      .setVersion("0.1.0")
      .build(),
  );
  SwaggerModule.setup("api/docs", app, document);
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, "127.0.0.1");
}

void bootstrap();
