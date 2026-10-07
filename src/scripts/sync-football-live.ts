import { runFootballLive } from "@/workers/football/live";

async function main() {
  const loop = process.argv.includes("--loop");
  await runFootballLive({ loop });
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
