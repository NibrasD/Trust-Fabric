import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  sessionToken: text("session_token").notNull().unique(),
  maxSpendUsdc: numeric("max_spend_usdc", { precision: 18, scale: 6 }).notNull(),
  spentUsdc: numeric("spent_usdc", { precision: 18, scale: 6 }).notNull().default("0"),
  allowedEndpoints: text("allowed_endpoints").array().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
