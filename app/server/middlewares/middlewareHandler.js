import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

// Rate limiter for auth routes (10 requests per 15 minutes per IP)
export const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	message: { success: false, error: "Too many requests, please try again after 15 minutes." },
	standardHeaders: true,
	legacyHeaders: false,
});

// Middleware to identify client type (dashboard vs app)
export const identifyClient = (req, res, next) => {
	const clientType = req.header("X-Client-Type") || "webpage";
	req.clientType = clientType; // "webpage" or "app"
	next();
};

export default function middlewareHandler(app) {
	app.use(
		cors({
			origin: function (origin, callback) {
				const allowedOrigins = [
					"http://localhost:5173", // Webpage dev
					"http://localhost:5174", // Electron dev
					process.env.FRONTEND_URL
				];
				// Allow if no origin (Electron file://), or matches allowed localhost/urls
				if (!origin || origin === 'file://' || origin.startsWith('app://') || allowedOrigins.includes(origin)) {
					callback(null, true);
				} else {
					callback(new Error('Not allowed by CORS'));
				}
			},
			credentials: true,
			allowedHeaders: ["Content-Type", "Authorization", "X-Client-Type"],
			methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
		})
	);
	app.use(express.json());
	app.use(identifyClient);
}
