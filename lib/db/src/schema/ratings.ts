import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ratingsTable = pgTable("ratings", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  serviceId: integer("service_id").notNull(),
  paymentId: integer("payment_id").notNull(),
  stars: integer("stars").notNull(),
  comment: text("comment"),
  reputationDelta: numeric("reputation_delta", { precision: 8, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRatingSchema = createInsertSchema(ratingsTable).omit({ id: true, createdAt: true });
export type InsertRating = z.infer<typeof insertRatingSchema>;
export type Rating = typeof ratingsTable.$inferSelect;
