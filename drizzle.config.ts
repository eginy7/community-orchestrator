import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.COMMUNITY_DATA_DIR ? `${process.env.COMMUNITY_DATA_DIR}/community.db` : "./data/community.db" },
});
