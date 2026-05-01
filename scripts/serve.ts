import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const apiCommand = existsSync("dist/pje-officer.js")
  ? ["bun", "dist/pje-officer.js", "serve", ...args]
  : ["bun", "run", "packages/api/src/index.ts", "serve", ...args];

const api = Bun.spawn(apiCommand, {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const code = await api.exited;
process.exit(code);
