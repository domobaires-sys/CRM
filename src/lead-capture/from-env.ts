/**
 * Arma el handler de captura con la configuración de las variables de entorno
 * (ver .env.example) y guarda en la base del CRM con Prisma.
 *
 * En Next.js alcanza con un archivo app/api/[...capture]/route.ts:
 *
 *   import { captureHandlerFromEnv } from "@/src/lead-capture/from-env";
 *   const handler = captureHandlerFromEnv();
 *   export { handler as GET, handler as POST, handler as OPTIONS };
 */
import { PrismaClient } from "@prisma/client";
import { createCaptureHandler } from "./handler.ts";
import { PrismaLeadSink } from "./sinks/prisma.ts";

export function captureHandlerFromEnv(env: Record<string, string | undefined> = process.env, db = new PrismaClient()) {
  const meta =
    env.META_VERIFY_TOKEN && env.META_APP_SECRET
      ? {
          verifyToken: env.META_VERIFY_TOKEN,
          appSecret: env.META_APP_SECRET,
          pageAccessToken: env.META_PAGE_ACCESS_TOKEN,
          graphVersion: env.META_GRAPH_VERSION,
        }
      : undefined;
  return createCaptureHandler({
    sink: new PrismaLeadSink(db),
    config: {
      basePath: env.CAPTURE_BASE_PATH ?? "/api",
      meta,
      web: { allowedOrigins: (env.WEB_FORM_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean) },
    },
  });
}
