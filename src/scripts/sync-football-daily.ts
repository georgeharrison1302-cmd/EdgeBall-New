import { runFootballDaily } from "@/workers/football/daily";

async function main() {
  await runFootballDaily();
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
