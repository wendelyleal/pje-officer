const api = Bun.spawn(["bun", "run", "packages/api/src/index.ts", "serve"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const web = Bun.spawn(["bun", "run", "--cwd", "packages/web", "dev"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

function stopAll() {
  if (api.exitCode === null) api.kill();
  if (web.exitCode === null) web.kill();
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

const [apiCode, webCode] = await Promise.all([api.exited, web.exited]);
stopAll();

if (apiCode !== 0) process.exit(apiCode);
if (webCode !== 0) process.exit(webCode);
