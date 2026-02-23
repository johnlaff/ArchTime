import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  // DIRECT_URL: conexão direta sem pgbouncer — necessário para db push / migrations
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
