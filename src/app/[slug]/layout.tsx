import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const space = await prisma.space.findUnique({
    where: { slug },
    select: { name: true },
  });
  if (!space) return { title: "Not found" };
  return {
    title: space.name,
    description: `AI-powered chat for ${space.name}`,
  };
}

export default async function ChatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await prisma.space.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!space) {
    notFound();
  }

  return <>{children}</>;
}
