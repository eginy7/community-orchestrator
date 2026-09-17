import { resolve } from "node:path";

/** Local, gitignored data directory (SQLite DB + pseudonym map). */
export const DATA_DIR = process.env.COMMUNITY_DATA_DIR ?? resolve(process.cwd(), "data");
export const DB_PATH = `${DATA_DIR}/community.db`;
