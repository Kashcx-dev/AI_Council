import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

const fetchUser = (req, res, next) => {
    // Get the token from the header (supports 'auth-token' or 'Bearer <token>')
    const token = req.header("auth-token") || req.header("Authorization")?.split(" ")[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: "Access Denied: No token provided" });
    }

    try {
        // Verify the token
        const data = jwt.verify(token, JWT_SECRET);
        req.user = data; // This adds the user ID to the request so your routes can use it!
        next();
    } catch (error) {
        res.status(401).json({ success: false, error: "Access Denied: Invalid token" });
    }
};

export default fetchUser;
