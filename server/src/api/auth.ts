import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { getDb } from '../db/sqlite';
import dotenv from 'dotenv';

dotenv.config();
export const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret-for-hackathon-only';

// Configure Nodemailer transporter (User fills these in .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body; // 'username' should ideally be an email address here
    if (!username || !password) return res.status(400).json({ error: 'Email (Username) and password required' });

    const db = await getDb();
    
    const existing = await db.get(`SELECT id FROM users WHERE username = ?`, [username]);
    if (existing) return res.status(400).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const result = await db.run(
      `INSERT INTO users (username, password, is_verified, two_factor_code) VALUES (?, ?, 0, ?)`, 
      [username, hash, code]
    );

    // Send the email
    if (process.env.SMTP_USER) {
      await transporter.sendMail({
        from: `"AI Council System" <${process.env.SMTP_USER}>`,
        to: username,
        subject: 'Your 2FA Verification Code',
        text: `Your AI Council verification code is: ${code}`,
        html: `<b>Your AI Council verification code is: ${code}</b>`,
      });
    }

    res.json({ message: 'Registration successful. Check your email for the 2FA code.', username });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/verify-2fa', async (req: Request, res: Response) => {
  try {
    const { username, code } = req.body;
    if (!username || !code) return res.status(400).json({ error: 'Username and code required' });

    const db = await getDb();
    const user = await db.get(`SELECT * FROM users WHERE username = ?`, [username]);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.two_factor_code !== code) return res.status(400).json({ error: 'Invalid verification code' });

    await db.run(`UPDATE users SET is_verified = 1, two_factor_code = NULL WHERE id = ?`, [user.id]);

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const db = await getDb();
    const user = await db.get(`SELECT * FROM users WHERE username = ?`, [username]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.is_verified === 0) return res.status(403).json({ error: 'Account not verified. Please complete 2FA.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = { userId: 0, username: 'anonymous' };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      req.user = { userId: 0, username: 'anonymous' };
    } else {
      req.user = user;
    }
    next();
  });
};
