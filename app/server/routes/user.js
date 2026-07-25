import express from "express";
import pool from "../middlewares/db.js";
import fetchUser from "../middlewares/fetchUser.js";

const router = express.Router();

// Route to get details of logged-in user: GET "/api/user/getuser"
router.get("/getuser", fetchUser, async (req, res) => {
	try {
		const userId = req.user.id;
		const user = await pool.query(
			"SELECT id, name, email, token_count, tier, created_at FROM users WHERE id = $1",
			[userId],
		);
		res.json({ success: true, user: user.rows[0] });
	} catch (error) {
		console.error(error.message);
		res.status(500).json({ success: false, error: "Internal Server Error" });
	}
});

// Route to upgrade subscription and add tokens: POST "/api/user/upgrade"
router.post("/upgrade", fetchUser, async (req, res) => {
	try {
		const userId = req.user.id;
		const { tier: newTier } = req.body;

		if (!["free", "pro", "elite"].includes(newTier)) {
			return res.status(400).json({ success: false, error: "Invalid tier specified" });
		}

		// Fetch current state
		const userResult = await pool.query("SELECT token_count, tier FROM users WHERE id = $1", [userId]);
		if (userResult.rows.length === 0) {
			return res.status(404).json({ success: false, error: "User not found" });
		}

		const currentCount = userResult.rows[0].token_count;
		const oldTier = userResult.rows[0].tier || "free";

		if (oldTier === newTier) {
			return res.status(400).json({ success: false, error: `You are already on the ${newTier} plan.` });
		}

		// Tier configs
		const bonuses = { free: 0, pro: 1000, elite: 5000 };
		const caps = { free: 1000, pro: 2000, elite: 6000 };

		// Calculate new token count
		let newCount = currentCount - bonuses[oldTier] + bonuses[newTier];
		
		// Enforce strict limits and floor at 0
		newCount = Math.min(newCount, caps[newTier]);
		newCount = Math.max(0, newCount);

		// Update database
		const updateResult = await pool.query(
			"UPDATE users SET token_count = $1, tier = $2 WHERE id = $3 RETURNING token_count, tier",
			[newCount, newTier, userId]
		);

		res.json({
			success: true,
			message: `Successfully moved to ${newTier} tier.`,
			token_count: updateResult.rows[0].token_count,
			tier: updateResult.rows[0].tier
		});
	} catch (error) {
		console.error("Error upgrading subscription:", error.message);
		res.status(500).json({ success: false, error: "Internal Server Error" });
	}
});

export default router;
