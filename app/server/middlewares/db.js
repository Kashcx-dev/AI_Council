import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const pool = new Pool({
	user: process.env.PG_USER || process.env.DB_USER,
	password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
	host: process.env.PG_HOST || process.env.DB_HOST || "localhost",
	port: process.env.PG_PORT || process.env.DB_PORT || 5432,
	database: process.env.PG_DATABASE || process.env.DB_NAME || "goldfish",
	connectionString: process.env.DATABASE_URL,
});

// Test and Initialize Database
const initDatabase = async () => {
	try {
		// Test connection
		const testRes = await pool.query("SELECT NOW()");
		console.log("Database connected successfully at:", testRes.rows[0].now);

		// Read and execute schema
		const schemaPath = path.join(__dirname, "../database/schema.sql");
		if (fs.existsSync(schemaPath)) {
			const schemaSql = fs.readFileSync(schemaPath, "utf8");
			await pool.query(schemaSql);
			console.log("Database tables and indexes initialized successfully.");
		}
	} catch (err) {
		console.error("Database initialization error:", err.stack);
	}
};

initDatabase();

export default pool;
