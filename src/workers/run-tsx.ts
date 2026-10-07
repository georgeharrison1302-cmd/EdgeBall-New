import { spawn } from "node:child_process";

export function runTsx(scriptPath: string, extraArgs: string[] = []) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "--yes",
        "tsx",
        "--env-file=.env.local",
        "--tsconfig",
        "scripts/tsconfig.json",
        scriptPath,
        ...extraArgs,
      ],
      {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env,
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptPath} exited ${code}`));
    });
  });
}
