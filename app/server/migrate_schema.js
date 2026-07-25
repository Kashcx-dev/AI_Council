import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from "./middlewares/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
    try {
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        const sql = fs.readFileSync(schemaPath, 'utf8');
        
        console.log("Running schema.sql...");
        await pool.query(sql);
        console.log("Migration successful!");
    } catch (error) {
        console.error("Migration failed:", error.message);
    } finally {
        process.exit(0);
    }
}

migrate();
