// Prints a bcrypt hash for APP_PASSWORD:  pnpm hash-password  (asks for the password)
import { createInterface } from "node:readline/promises";
import { hashPassword } from "@/lib/auth/password";

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = (await rl.question("Password (min 8 caratteri): ")).trim();
  rl.close();
  if (password.length < 8) throw new Error("Password troppo corta");
  const hash = await hashPassword(password);
  console.log("\nIl carattere $ va scritto in modo diverso a seconda di chi legge il .env:");
  console.log("\n  .env per `pnpm dev` / `pnpm start` (Next.js):");
  console.log(`  APP_PASSWORD=${hash.replace(/\$/g, "\\$")}`);
  console.log("\n  .env per Docker Compose (env_file):");
  console.log(`  APP_PASSWORD='${hash}'`);
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
