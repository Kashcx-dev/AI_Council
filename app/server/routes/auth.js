import express from "express";
import { body, validationResult } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import pool from "../middlewares/db.js";
import { sendEmail } from "../helper/Mailing.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// In-memory stores for OTPs (MVP phase)
const otpStore = new Map();
const signupStore = new Map();

// Generate 6-digit OTP
const generateOTP = () => crypto.randomInt(100000, 999999).toString();

router.post(
	"/signup",
	[
		body("name", "Enter a valid name").isLength({ min: 3 }),
		body("email", "Enter a valid mail").isEmail(),
		body("password", "Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a symbol").isStrongPassword({
			minLength: 8,
			minLowercase: 1,
			minUppercase: 1,
			minNumbers: 1,
			minSymbols: 1,
		}),
	],
	async (req, res) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res
				.status(400)
				.json({ success: false, errors: errors.array() });
		}

		const { name, email, password } = req.body;

		try {
			const userExists = await pool.query(
				"SELECT * FROM users WHERE email = $1",
				[email],
			);

			if (userExists.rows.length > 0) {
				return res.status(400).json({
					success: false,
					error: "User with this email already exists",
				});
			}

			const salt = await bcrypt.genSalt(10);
			const securedPassword = await bcrypt.hash(password, salt);

			const otp = generateOTP();
			const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins

			signupStore.set(email, {
				name,
				email,
				password_hash: securedPassword,
				code: otp,
				expiresAt,
			});

			await sendEmail(
				email,
				"Verify Your GoldFish Account",
				`Your verification OTP is: ${otp}. Valid for 5 minutes.`,
			);

			res.status(200).json({
				success: true,
				requires2FA: true,
				message: "OTP sent to email",
			});
		} catch (error) {
			res.status(500).json({ success: false, message: error.message });
		}
	},
);

router.post("/verify-signup-otp", async (req, res) => {
	const { email, otp } = req.body;
	const record = signupStore.get(email);

	if (!record) {
		return res.status(400).json({
			success: false,
			error: "No signup session found or expired.",
		});
	}

	if (Date.now() > record.expiresAt) {
		signupStore.delete(email);
		return res
			.status(400)
			.json({ success: false, error: "OTP expired. Please signup again." });
	}

	if (record.code === otp) {
		try {
			const newUser = await pool.query(
				"INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, token_count, created_at",
				[record.name, record.email, record.password_hash],
			);

			signupStore.delete(email);

			const token = jwt.sign({ id: newUser.rows[0].id }, JWT_SECRET, {
				expiresIn: "7d",
			});

			return res.status(201).json({
				success: true,
				message: "Signup successful",
				token,
				user: {
					id: newUser.rows[0].id,
					name: newUser.rows[0].name,
					email: newUser.rows[0].email,
					token_count: newUser.rows[0].token_count,
				},
			});
		} catch (error) {
			return res
				.status(500)
				.json({ success: false, message: error.message });
		}
	}

	res.status(400).json({ success: false, error: "Invalid OTP" });
});

router.post(
	"/login",
	[
		body("email", "Enter a valid email or username").exists(),
		body("password", "Password can not be blank").exists(),
	],
	async (req, res) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res
				.status(400)
				.json({ success: false, errors: errors.array() });
		}

		const { email, password } = req.body;

		try {
			const userResult = await pool.query(
				"SELECT * FROM users WHERE email = $1 OR name = $1",
				[email],
			);

			if (userResult.rows.length === 0) {
				return res
					.status(400)
					.json({ success: false, error: "Invalid credentials" });
			}

			const user = userResult.rows[0];

			const isPasswordValid = await bcrypt.compare(
				password,
				user.password_hash,
			);
			if (!isPasswordValid) {
				return res
					.status(400)
					.json({ success: false, error: "Invalid credentials" });
			}

			const otp = generateOTP();
			const expiresAt = Date.now() + 5 * 60 * 1000;

			otpStore.set(email, {
				user,
				code: otp,
				expiresAt,
			});

			await sendEmail(
				email,
				"Your GoldFish Login OTP",
				`Your OTP for login is: ${otp}. Valid for 5 minutes.`,
			);

			res.json({
				success: true,
				requires2FA: true,
				message: "OTP sent to email",
			});
		} catch (error) {
			res.status(500).json({ success: false, message: error.message });
		}
	},
);

router.post("/verify-otp", async (req, res) => {
	const { email, otp } = req.body;
	const record = otpStore.get(email);

	if (!record) {
		return res
			.status(400)
			.json({ success: false, error: "No login session found or expired." });
	}

	if (Date.now() > record.expiresAt) {
		otpStore.delete(email);
		return res
			.status(400)
			.json({ success: false, error: "OTP expired. Please login again." });
	}

	if (record.code === otp) {
		const user = record.user;
		otpStore.delete(email);

		const token = jwt.sign({ id: user.id }, JWT_SECRET, {
			expiresIn: "7d",
		});

		return res.json({
			success: true,
			message: "Login successful",
			token,
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				token_count: user.token_count,
			},
		});
	}

	res.status(400).json({ success: false, error: "Invalid OTP" });
});


export default router;
