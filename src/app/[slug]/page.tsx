import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ChatInterface } from "@/components/chat/chat-interface";
import { hasActivePlan } from "@/lib/usage";
import { isSubscriptionCurrent } from "@/lib/subscription";

export default async function SpaceChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await prisma.space.findUnique({
    where: { slug },
    include: {
      model: { include: { model: true } },
      subscription: {
        select: { tier: true, schedule: true, activeFrom: true, activeUntil: true },
      },
    },
  });

  if (!space) {
    notFound();
  }

  const hasComputeAccess = await hasActivePlan(space.id);
  const subscription =
    space.subscription && isSubscriptionCurrent(space.subscription)
      ? { tier: space.subscription.tier, schedule: space.subscription.schedule }
      : null;

  return (
    <ChatInterface
      space={{
        ...space,
        subscription,
        hasComputeAccess,
      }}
    />
  );
}
