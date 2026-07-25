import pool from "./middlewares/db.js";

async function addTierColumn() {
	try {
		await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'free';");
		console.log("Successfully added tier column to users table!");
	} catch (error) {
		console.error("Error adding column:", error.message);
	} finally {
		process.exit(0);
	}
}

addTierColumn();
