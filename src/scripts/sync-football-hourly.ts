import { runFootballHourly } from "@/workers/football/hourly";

async function main() {
  const force = process.argv.includes("--force");
  await runFootballHourly({ force });
}

main().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
