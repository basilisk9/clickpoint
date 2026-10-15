import { randomBytes } from "crypto";

export function createId(prefix = ""): string {
  const body = randomBytes(9).toString("hex");
  return prefix ? `${prefix}_${body}` : body;
}
