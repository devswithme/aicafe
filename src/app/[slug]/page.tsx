import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ChatInterface } from "@/components/chat/chat-interface";
import { hasActivePlan } from "@/lib/usage";

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
      subscription: { select: { tier: true, schedule: true } },
    },
  });

  if (!space) {
    notFound();
  }

  const hasComputeAccess = await hasActivePlan(space.id);

  return <ChatInterface space={{ ...space, hasComputeAccess }} />;
}
