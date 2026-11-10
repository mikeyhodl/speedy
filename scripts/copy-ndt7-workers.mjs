import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(join(root, "public"), { recursive: true });

for (const name of ["ndt7-download-worker.js", "ndt7-upload-worker.js"]) {
  await copyFile(join(root, "node_modules", "@m-lab", "ndt7", "src", name), join(root, "public", name));
}
