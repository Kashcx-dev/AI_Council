import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import middlewareHandler, { authLimiter } from "../middlewares/middlewareHandler.js";
import authRoutes from "../routes/auth.js";
import userRoutes from "../routes/user.js";
import chatRoutes from "../routes/chats.js";
import pool from "../middlewares/db.js";

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

// Apply middlewares
middlewareHandler(app);

// Routes (with rate limiting on auth)
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/chats", chatRoutes);

// Health check
app.get("/api/health", (req, res) => {
	res.json({ message: "Server is running", clientType: req.clientType });
});

// 404 handler
app.use((req, res, next) => {
	res.status(404).json({ success: false, message: "Page not found" });
});

// 500 error handler
app.use((error, req, res, next) => {
	console.error(error);
	res.status(500).json({ success: false, error: error.message });
});



// ─── Python Microservice WebSocket Client (Auto-Reconnecting) ───
let pythonWs = null;
const activeChats = new Map(); // Maps chatId -> Electron WebSocket client
const aiResponseBuffer = new Map(); // Maps chatId -> accumulated response string

function connectToPython() {
	pythonWs = new WebSocket("ws://127.0.0.1:8000/ws/cognee");

	pythonWs.on("open", () => {
		console.log("Connected to Python Cognee Service!");
	});

	pythonWs.on("message", async (data) => {
		try {
			const payload = JSON.parse(data);
			const { chatId, chunk, isLast } = payload;
			
			const clientWs = activeChats.get(chatId);
			if (clientWs && clientWs.readyState === 1) {
				clientWs.send(JSON.stringify({ type: "chat_stream", chatId, chunk, isLast }));
			}

			// Buffer AI response to save to DB when finished
			let currentStr = aiResponseBuffer.get(chatId) || "";
			currentStr += chunk;
			aiResponseBuffer.set(chatId, currentStr);

			if (isLast) {
				const finalText = currentStr.trim();
				// Save AI message to DB
				await pool.query(
					"INSERT INTO conversations (chat_id, sender, text) VALUES ($1, $2, $3)",
					[chatId, "ai", finalText]
				);
				aiResponseBuffer.delete(chatId);
				activeChats.delete(chatId);
			}
		} catch (error) {
			console.error("Error handling Python WS message:", error);
		}
	});

	pythonWs.on("error", (error) => {
		console.error("Python WS Error:", error.message);
	});

	pythonWs.on("close", () => {
		console.log("Python WS disconnected. Reconnecting in 3s...");
		setTimeout(connectToPython, 3000);
	});
}

connectToPython();

// ─── WebSocket Server (for Electron App) ───
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", async (ws, req) => {
	// Authenticate the WebSocket connection via JWT in query string
	const url = new URL(req.url, `http://localhost:${PORT}`);
	const token = url.searchParams.get("token");

	if (!token) {
		ws.close(4001, "No token provided");
		return;
	}

	try {
		const decoded = jwt.verify(token, JWT_SECRET);
		ws.userId = decoded.id;
		ws.isAlive = true;

		// Fetch token count for this user
		const result = await pool.query("SELECT token_count FROM users WHERE id = $1", [decoded.id]);
		const tokenCount = result.rows[0]?.token_count ?? 0;

		// Send initial handshake with token info
		ws.send(JSON.stringify({
			type: "connected",
			success: true,
			tokens: tokenCount <= 0 ? null : tokenCount,
			message: tokenCount <= 0 ? "No tokens remaining" : "Connected to GoldFish Server",
		}));

		ws.on("message", async (data) => {
			try {
				const msg = JSON.parse(data);
				const userPrompt = msg.text;
				const chatId = msg.chatId;

				// Verify chat ownership
				const chatCheck = await pool.query("SELECT id FROM chats WHERE id = $1 AND user_id = $2", [chatId, ws.userId]);
				if (chatCheck.rows.length === 0) {
					return ws.send(JSON.stringify({ type: "error", message: "Invalid chat" }));
				}

				// 1. Check token count
				const res = await pool.query("SELECT token_count FROM users WHERE id = $1", [ws.userId]);
				let currentTokens = res.rows[0].token_count;
				
				// Calculate estimated token cost (mock: 1 token per 5 chars)
				const estimatedCost = Math.max(1, Math.ceil(userPrompt.length / 5));
				
				if (currentTokens < estimatedCost) {
					return ws.send(JSON.stringify({ type: "error", message: "Not enough tokens to process message" }));
				}

				// 2. Subtract tokens
				const newTokens = currentTokens - estimatedCost;
				await pool.query("UPDATE users SET token_count = $1 WHERE id = $2", [newTokens, ws.userId]);
				
				// 3. Save User message to DB
				await pool.query(
					"INSERT INTO conversations (chat_id, sender, text) VALUES ($1, $2, $3)",
					[chatId, "user", userPrompt]
				);

				// 4. Forward to Python Microservice
				if (pythonWs.readyState === WebSocket.OPEN) {
					activeChats.set(chatId, ws);
					pythonWs.send(JSON.stringify({
						chatId: chatId,
						text: userPrompt,
						model: msg.model || 'gpt-4o',
						workspaceDir: msg.workspaceDir || ''
					}));
				} else {
					ws.send(JSON.stringify({ type: "error", message: "Python AI Service is currently unreachable" }));
				}
			} catch (error) {
				console.error("WS Message Error:", error);
			}
		});

		ws.on("pong", () => { ws.isAlive = true; });

	} catch (error) {
		ws.close(4003, "Invalid token");
	}
});

// Heartbeat to clean up dead connections
const heartbeat = setInterval(() => {
	wss.clients.forEach((ws) => {
		if (!ws.isAlive) return ws.terminate();
		ws.isAlive = false;
		ws.ping();
	});
}, 30000);

wss.on("close", () => clearInterval(heartbeat));

// Start the HTTP + WebSocket server
server.listen(PORT, () => {
	console.log(`Server running on port ${PORT} (HTTP + WebSocket)`);
});
