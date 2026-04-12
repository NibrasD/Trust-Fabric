import { pgTable, text, serial, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  stellarAddress: text("stellar_address").notNull().unique(),
  reputationScore: numeric("reputation_score", { precision: 6, scale: 2 }).notNull().default("0"),
  totalTransactions: integer("total_transactions").notNull().default(0),
  avgRating: numeric("avg_rating", { precision: 4, scale: 2 }).notNull().default("0"),
  totalSpentUsdc: numeric("total_spent_usdc", { precision: 18, scale: 6 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
