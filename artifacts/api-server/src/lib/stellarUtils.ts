import { randomBytes } from "crypto";

export function generateStellarTxHash(): string {
  return randomBytes(32).toString("hex").toUpperCase();
}

export { randomBytes as crypto };
