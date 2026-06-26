import { t } from "../trpc";
import { publicProcedure } from "../context";

export const modelsRouter = t.router({
  list: publicProcedure.query(async ({ ctx }) => {
    // Only expose models that are actually supported by the inference backend.
    // (We currently deploy via Modal, so hide legacy/previous providers.)
    return ctx.prisma.aIModel.findMany({
      where: { isActive: true, provider: "modal" },
    });
  }),
});
