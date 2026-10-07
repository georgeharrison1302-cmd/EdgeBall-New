import { parseWorkerArgs, runWorker } from "@/workers/scheduler";

async function main() {
  const options = parseWorkerArgs(process.argv.slice(2));
  await runWorker(options);
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
