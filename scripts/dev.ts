/** Runs the server (with reload) and the Vite dev server together. */
export {};
const procs = [
  Bun.spawn(["bun", "run", "--watch", "src/server/main.ts", "--no-open"], { stdio: ["inherit", "inherit", "inherit"] }),
  Bun.spawn(["bunx", "vite"], { stdio: ["inherit", "inherit", "inherit"] }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race(procs.map((p) => p.exited));
stop();
