import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ChatInterface } from "@/components/chat/chat-interface";

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

  return <ChatInterface space={space} />;
}
