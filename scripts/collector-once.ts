import db from "../server/utils/db";
import { collectDueShops } from "../server/utils/collector";

async function main() {
  try {
    const results = await collectDueShops();
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await db.$disconnect();
  }
}

void main();
