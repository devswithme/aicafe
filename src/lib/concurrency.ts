import { prisma } from "@/lib/prisma";

/** Max simultaneous inference requests allowed per space. */
export const MAX_CONCURRENT_USERS_PER_SPACE = 15;

/** Matches Modal request timeout (10 min). Used to auto-expire stale slots. */
const SLOT_TTL_MS = 10 * 60 * 1000;

export async function acquireInferenceSlot(
  spaceId: string
): Promise<{ id: string } | null> {
  return prisma.$transaction(
    async (tx) => {
      const now = new Date();

      await tx.activeInference.deleteMany({
        where: { spaceId, expiresAt: { lt: now } },
      });

      const active = await tx.activeInference.count({ where: { spaceId } });
      if (active >= MAX_CONCURRENT_USERS_PER_SPACE) return null;

      const slot = await tx.activeInference.create({
        data: {
          spaceId,
          expiresAt: new Date(now.getTime() + SLOT_TTL_MS),
        },
      });

      return { id: slot.id };
    },
    { isolationLevel: "Serializable" }
  );
}

export async function releaseInferenceSlot(slotId: string): Promise<void> {
  await prisma.activeInference
    .delete({ where: { id: slotId } })
    .catch(() => {
      // Slot may already have been cleaned up
    });
}

export async function getActiveInferenceCount(spaceId: string): Promise<number> {
  const now = new Date();
  await prisma.activeInference.deleteMany({
    where: { spaceId, expiresAt: { lt: now } },
  });
  return prisma.activeInference.count({ where: { spaceId } });
}
