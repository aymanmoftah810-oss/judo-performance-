import { randomBytes, randomInt, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;

export function validatePassword(password: string): string | null {
  if (password.length < 12) return "يجب أن تتكون كلمة المرور من 12 حرفًا على الأقل";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "يجب أن تحتوي كلمة المرور على حروف وأرقام";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const issue = validatePassword(password); if (issue) throw new Error(issue);
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generateTemporaryPassword(): string {
  const categories = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%"];
  const alphabet = categories.join("");
  const characters = [...categories.map((category) => category[randomInt(category.length)]), ...Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)])];
  for (let index = characters.length - 1; index > 0; index -= 1) { const swapIndex = randomInt(index + 1); [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]]; }
  return characters.join("");
}
