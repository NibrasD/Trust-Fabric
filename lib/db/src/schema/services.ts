import { pgTable, text, serial, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  endpoint: text("endpoint").notNull(),
  priceUsdc: numeric("price_usdc", { precision: 18, scale: 6 }).notNull(),
  ownerAddress: text("owner_address").notNull(),
  reputationScore: numeric("reputation_score", { precision: 6, scale: 2 }).notNull().default("80"),
  totalCalls: integer("total_calls").notNull().default(0),
  avgRating: numeric("avg_rating", { precision: 4, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertServiceSchema = createInsertSchema(servicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;
