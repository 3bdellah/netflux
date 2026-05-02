import { copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

const distPath = join(process.cwd(), "dist");
const indexPath = join(distPath, "index.html");
const fallbackPath = join(distPath, "404.html");

await access(indexPath, constants.R_OK);
await copyFile(indexPath, fallbackPath);
