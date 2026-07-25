import express from "express";
import pool from "../middlewares/db.js";
import fetchUser from "../middlewares/fetchUser.js";

const router = express.Router();

// Get all chats for the authenticated user
router.get("/", fetchUser, async (req, res) => {
    try {
        // Assume req.user is set by authentication middleware
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        const result = await pool.query(
            "SELECT * FROM chats WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3",
            [userId, limit, offset]
        );

        res.json({ success: true, chats: result.rows });
    } catch (error) {
        console.error("Error fetching chats:", error);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// Create a new chat
router.post("/", fetchUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

        const { title, model, workspace_dir } = req.body;

        const result = await pool.query(
            "INSERT INTO chats (user_id, title, model, workspace_dir) VALUES ($1, $2, $3, $4) RETURNING *",
            [userId, title || 'New Chat', model || 'gpt-4o', workspace_dir || null]
        );

        res.json({ success: true, chat: result.rows[0] });
    } catch (error) {
        console.error("Error creating chat:", error);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// Update chat configuration
router.patch("/:id", fetchUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

        const { id } = req.params;
        const { title, model, workspace_dir } = req.body;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return res.status(400).json({ success: false, error: "Invalid chat ID format" });
        }

        const result = await pool.query(
            "UPDATE chats SET title = COALESCE($1, title), model = COALESCE($2, model), workspace_dir = COALESCE($3, workspace_dir), updated_at = CURRENT_TIMESTAMP WHERE id = $4 AND user_id = $5 RETURNING *",
            [title, model, workspace_dir, id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Chat not found" });
        }

        res.json({ success: true, chat: result.rows[0] });
    } catch (error) {
        console.error("Error updating chat:", error);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// Get conversations (messages) for a specific chat
router.get("/:id/messages", fetchUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

        const { id } = req.params;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return res.status(400).json({ success: false, error: "Invalid chat ID format" });
        }

        // Verify ownership
        const chatCheck = await pool.query("SELECT id FROM chats WHERE id = $1 AND user_id = $2", [id, userId]);
        if (chatCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Chat not found" });
        }

        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const result = await pool.query(
            "SELECT * FROM conversations WHERE chat_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3",
            [id, limit, offset]
        );

        res.json({ success: true, messages: result.rows });
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// Delete a chat and its conversations
router.delete("/:id", fetchUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

        const { id } = req.params;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return res.status(400).json({ success: false, error: "Invalid chat ID format" });
        }

        // Delete conversations first (foreign key), then the chat
        await pool.query("DELETE FROM conversations WHERE chat_id = $1", [id]);
        const result = await pool.query("DELETE FROM chats WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Chat not found" });
        }

        res.json({ success: true, message: "Chat deleted" });
    } catch (error) {
        console.error("Error deleting chat:", error);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

export default router;
