import { readFileSync } from "fs";

const sql = readFileSync(new URL("../data/seed.sql", import.meta.url), "utf8");
const chunks = sql.split(/(?=^insert into import_batches|^do \$\$)/m).filter(Boolean);
for (let i = 0; i < chunks.length; i++) {
  const path = new URL(`../data/seed-chunk-${i}.sql`, import.meta.url);
  await import("fs").then((fs) => fs.writeFileSync(path, chunks[i]));
}
console.log(`Wrote ${chunks.length} chunks`);
