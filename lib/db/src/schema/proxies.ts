import { pgTable, text, serial, boolean, numeric, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const proxiesTable = pgTable("proxies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  targetUrl: text("target_url").notNull(),
  httpMethod: text("http_method").notNull().default("POST"),
  amountUsdc: numeric("amount_usdc", { precision: 18, scale: 6 }).notNull().default("0.10"),
  variables: jsonb("variables").$type<Array<{
    name: string;
    type: "string" | "number" | "boolean";
    required: boolean;
    description?: string;
  }>>(),
  headers: jsonb("headers").$type<Record<string, string>>(),
  isActive: boolean("is_active").notNull().default(true),
  totalCalls: integer("total_calls").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProxySchema = createInsertSchema(proxiesTable).omit({ id: true, totalCalls: true, createdAt: true, updatedAt: true });
export type InsertProxy = z.infer<typeof insertProxySchema>;
export type Proxy = typeof proxiesTable.$inferSelect;
