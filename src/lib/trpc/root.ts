import { t } from "@/lib/trpc/trpc";
import { helloRouter } from "./routes/hello";
import { spacesRouter } from "./routes/spaces";
import { modelsRouter } from "./routes/models";
import { whitelistRouter } from "./routes/whitelist";
import { chatRouter } from "./routes/chat";
import { analyticsRouter } from "./routes/analytics";
import { paymentRouter } from "./routes/payment";
import { keysRouter } from "./routes/keys";

export const appRouter = t.router({
  hello: helloRouter,
  spaces: spacesRouter,
  models: modelsRouter,
  whitelist: whitelistRouter,
  chat: chatRouter,
  analytics: analyticsRouter,
  payment: paymentRouter,
  keys: keysRouter,
});

export type AppRouter = typeof appRouter;
