import { Router, Request, Response } from 'express';
import { runCouncilDebate } from '../council/engine.js';
import { executeCouncilPlan } from '../executor/openclaw.js';

export const apiRouter = Router();

apiRouter.post('/council/deliberate', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const decision = await runCouncilDebate(prompt);
    res.json(decision);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post('/council/execute', async (req: Request, res: Response) => {
  try {
    const { plan } = req.body;
    if (!plan) {
      res.status(400).json({ error: 'Confirmed plan is required' });
      return;
    }

    const executionResults = await executeCouncilPlan(plan);
    res.json({ status: 'COMPLETED', results: executionResults });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

