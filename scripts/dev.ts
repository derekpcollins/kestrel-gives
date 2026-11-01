// `npm start`: runs tsc --watch (front end → public/js), the component CSS build in
// watch mode, and vercel dev side by side, with prefixed output. Ctrl-C stops both, and if either exits the other is
// stopped too, so nothing keeps running unseen. Each tool gets its own process
// group because `vercel` runs a native child that a plain kill would orphan.
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

const processes = new Map<string, ChildProcess>();
let stopping = false;

start("tsc", "node_modules/.bin/tsc", ["-p", "tsconfig.client.json", "--watch", "--preserveWatchOutput"]);
start("css", "node", ["scripts/build-css.ts", "--watch"]);
start("vercel", "vercel", ["dev"]);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => stopAll(0));
}

function start(name: string, command: string, args: string[]): void {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
  processes.set(name, child);
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on("line", (line) => console.log(`[${name}] ${line}`));
  }
  child.on("error", (error) => {
    console.error(`[${name}] failed to start: ${error.message}`);
    stopAll(1);
  });
  child.on("exit", (code, signal) => {
    processes.delete(name);
    if (!stopping) {
      console.error(`[${name}] exited (${signal ?? `code ${code}`}); stopping the rest.`);
      stopAll(code ?? 1);
    } else if (processes.size === 0) {
      process.exit(process.exitCode ?? 0);
    }
  });
}

function stopAll(code: number): void {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of processes.values()) {
    if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
  }
  if (processes.size === 0) process.exit(code);
}
