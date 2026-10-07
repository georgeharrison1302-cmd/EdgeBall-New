import {
  IngestQuotaStop,
  ingestRemainingCache,
} from "../src/utils/api-football/ingest-detail";

async function main() {
  const smoke = process.argv.includes("--smoke");
  const result = await ingestRemainingCache(smoke ? 1 : undefined);
  console.log(`failed: ${result.failed.length}`);
  console.log(result.stopped ? "stopped: quota reserve" : "stopped: complete");
  if (!result.stopped && result.failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  if (error instanceof IngestQuotaStop) {
    console.log(error.message);
    process.exit(0);
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
