import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  serviceId: integer("service_id").notNull(),
  sessionId: integer("session_id"),
  amountUsdc: numeric("amount_usdc", { precision: 18, scale: 6 }).notNull(),
  txHash: text("tx_hash").notNull(),
  status: text("status").notNull().default("confirmed"),
  network: text("network").notNull().default("testnet"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
