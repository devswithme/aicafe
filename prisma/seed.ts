import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ACTIVE_MODEL_ID = "qwen3-1.7b-q4_k_m";

async function main() {
  console.log("Seeding database...");

  // Deactivate legacy models so only the current Modal backend model is selectable.
  await prisma.aIModel.updateMany({
    where: { id: { not: ACTIVE_MODEL_ID } },
    data: { isActive: false },
  });

  await prisma.aIModel.upsert({
    where: { id: ACTIVE_MODEL_ID },
    update: {
      displayName: "Qwen",
      provider: "modal",
      description: null,
      isActive: true,
    },
    create: {
      id: ACTIVE_MODEL_ID,
      name: "qwen3-1.7b-q4_k_m",
      displayName: "Qwen",
      description: null,
      provider: "modal",
      modelId: "qwen3-1.7b-q4_k_m",
      isActive: true,
    },
  });

  console.log("✓ Seeded AI model: Qwen (llama-cpp / T4)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
