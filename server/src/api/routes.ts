import { Router, Request, Response } from 'express';
import { runCouncilDebate } from '../council/engine';
import { executeCouncilPlan } from '../executor/openclaw';
import { rateLimiter } from '../Middlewares/MiddlewareMaster';
import { authRouter, authenticateToken } from './auth';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

// Tier 2: Council Deliberation (High-frequency AI chat endpoint)
apiRouter.post('/council/deliberate', authenticateToken, rateLimiter(2), async (req: any, res: Response) => {
  try {
    const { prompt, cwd } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const decision = await runCouncilDebate(prompt, cwd, req.user);
    res.json(decision);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Tier 2: Council Action Execution
apiRouter.post('/council/execute', authenticateToken, rateLimiter(2), async (req: any, res: Response) => {
  try {
    const { plan, cwd } = req.body;
    if (!plan) {
      res.status(400).json({ error: 'Confirmed plan is required' });
      return;
    }

    const executionResults = await executeCouncilPlan(plan, cwd, req.user);
    res.json({ status: 'COMPLETED', results: executionResults });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


