import { Request, Response, NextFunction } from 'express';

export type RateLimitTier = 0 | 1 | 2;

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message: string;
}

// Configuration for each security tier:
// Tier 0: Highest Security (e.g., Login / Auth) -> 4 requests per 15 minutes
// Tier 1: Sensitive Actions (e.g., Password Reset / Admin) -> 10 requests per 15 minutes
// Tier 2: Low Security / High Frequency (e.g., Council Debates / Chat) -> 100 requests per minute
export const TIER_CONFIGS: Record<RateLimitTier, RateLimitConfig> = {
  0: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 4,
    message: 'Too many security-sensitive attempts. Please try again after 15 minutes.',
  },
  1: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    message: 'Too many requests for this action. Please try again after 15 minutes.',
  },
  2: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Rate limit exceeded. Please slow down your requests.',
  },
};

// Memory store for tracking requests per IP and tier
const rateLimitStore = new Map<string, number[]>();

// Periodically clean up expired records every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitStore.entries()) {
    const validTimestamps = timestamps.filter((t) => now - t < 15 * 60 * 1000);
    if (validTimestamps.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, validTimestamps);
    }
  }
}, 5 * 60 * 1000);

/**
 * Creates an Express rate limiting middleware based on tier choice (0, 1, or 2).
 * @param tierChoice 0 = Highest Security (Login), 1 = Medium (Password Reset), 2 = High Frequency (Chat)
 */
export function rateLimiter(tierChoice: RateLimitTier) {
  const config = TIER_CONFIGS[tierChoice];

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown-ip';
    const key = `tier_${tierChoice}:${ip}`;
    const now = Date.now();

    const timestamps = rateLimitStore.get(key) || [];
    const validRequests = timestamps.filter((t) => now - t < config.windowMs);

    if (validRequests.length >= config.maxRequests) {
      const oldestRequest = validRequests[0];
      const retryAfterSeconds = Math.ceil((oldestRequest + config.windowMs - now) / 1000);

      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        error: 'Too Many Requests',
        message: config.message,
        retryAfterSeconds,
      });
      return;
    }

    validRequests.push(now);
    rateLimitStore.set(key, validRequests);
    next();
  };
}