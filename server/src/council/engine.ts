import { tracer, tokenCounter, consensusGauge, iterationCounter, agentLatency, agentTokenCounter } from '../telemetry/signoz';
import { Groq } from 'groq-sdk';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { getDb } from '../db/sqlite';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface AgentResponse {
  agentName: string;
  role: string;
  opinion: string;
  command?: string;
  vote: 'APPROVE' | 'REJECT' | 'AMEND';
  confidence: number;
  highlights?: string[];
  tokensUsed: number;
  latencyMs: number;
  round: number;
}

export interface CouncilDecision {
  task: string;
  status: 'CONSENSUS_REACHED' | 'DISAGREEMENT' | 'REJECTED';
  overallConfidence: number;
  approveRate: number;
  rejectRate: number;
  finalPlan: string;
  finalCommand: string;
  agentDebates: AgentResponse[];
  roundsTaken: number;
}

const MAX_ROUNDS = 5;

const AGENTS = [
  { name: 'Llama-3.3-70B', model: 'llama-3.3-70b-versatile', role: 'System & Execution Architect' },
  { name: 'Llama-3.1-8B', model: 'llama-3.1-8b-instant', role: 'Security & Safety Evaluator' },
  { name: 'Qwen-27B', model: 'qwen/qwen3.6-27b', role: 'Efficiency & Edge-Case Specialist' },
];

async function queryAgent(
  agent: typeof AGENTS[0],
  systemPrompt: string,
  userPrompt: string,
  round: number
): Promise<AgentResponse> {
  return tracer.startActiveSpan(`agent_${agent.name}_round_${round}`, async (agentSpan) => {
    agentSpan.setAttribute('agent.name', agent.name);
    agentSpan.setAttribute('agent.round', round);

    const startTime = Date.now();

    let completion;
    let tokens = 0;
    try {
      completion = await groq.chat.completions.create({
        model: agent.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000
      });
      tokens = completion.usage?.total_tokens || 0;
    } catch (err: any) {
      console.warn(`[Council] ${agent.name} failed JSON validation, retrying...`, err.message);
      // Fallback if JSON mode fails on Groq's side
      try {
        completion = await groq.chat.completions.create({
          model: agent.model,
          messages: [
            { role: "system", content: systemPrompt + " (OUTPUT PURE JSON ONLY, NO MARKDOWN, NO THINKING TAGS)" },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 4000
        });
        tokens = completion.usage?.total_tokens || 0;
      } catch (err2: any) {
        console.error(`[Council] ${agent.name} totally failed:`, err2.message);
      }
    }

    const latencyMs = Date.now() - startTime;
    
    let resData: any = {};
    if (completion && completion.choices && completion.choices[0].message.content) {
      let contentStr = completion.choices[0].message.content;
      // Extract JSON block in case there's extra text or cut-off think tags
      const firstBrace = contentStr.indexOf('{');
      const lastBrace = contentStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
        contentStr = contentStr.substring(firstBrace, lastBrace + 1);
      }
      
      try {
        resData = JSON.parse(contentStr);
      } catch (parseErr) {
        console.error(`[Council] ${agent.name} failed to parse JSON string:`, contentStr.substring(0, 200) + '...');
        resData = { opinion: "Failed to generate valid JSON.", vote: "REJECT", confidence: 0 };
      }
    } else {
      resData = { opinion: "Agent API call failed.", vote: "REJECT", confidence: 0 };
    }

    // Record per-model SigNoz metrics
    tokenCounter.add(tokens, { agent: agent.name });
    agentTokenCounter.add(tokens, { agent: agent.name, round: round.toString() });
    agentLatency.record(latencyMs, { agent: agent.name, round: round.toString() });

    const response: AgentResponse = {
      agentName: agent.name,
      role: agent.role,
      opinion: resData.opinion || 'No opinion generated',
      command: resData.command || '',
      vote: resData.vote || 'APPROVE',
      confidence: resData.confidence || 90,
      highlights: resData.highlights || [],
      tokensUsed: tokens,
      latencyMs,
      round,
    };

    agentSpan.setAttribute('agent.vote', response.vote);
    agentSpan.setAttribute('agent.confidence', response.confidence);
    agentSpan.setAttribute('agent.tokens', tokens);
    agentSpan.setAttribute('agent.latency_ms', latencyMs);
    agentSpan.end();

    return response;
  });
}

export async function runCouncilDebate(taskPrompt: string, cwd?: string, user?: any, activeFile?: any): Promise<CouncilDecision> {
  return tracer.startActiveSpan('council_deliberation', async (span) => {
    span.setAttribute('council.task', taskPrompt);
    span.setAttribute('council.cwd', cwd || 'unknown');
    if (user) {
      span.setAttribute('user.id', user.userId);
      span.setAttribute('user.username', user.username);
    }
    
    // Build shared context — ALL models see the SAME thing
    let dirContext = 'Unknown';
    if (cwd && fs.existsSync(cwd)) {
      try {
        const items = fs.readdirSync(cwd, { withFileTypes: true });
        dirContext = items.map(f => f.isDirectory() ? `📁 ${f.name}` : `📄 ${f.name}`).join('\n');
      } catch (e) {
        dirContext = 'Failed to read directory.';
      }
    }

    let fileContext = '';
    if (activeFile && activeFile.content) {
      fileContext = `\nThe user is currently looking at this active file (${activeFile.name}):\n\`\`\`\n${activeFile.content}\n\`\`\`\n`;
    }

    let sharedContext = '';
    if (cwd && cwd !== 'undefined' && cwd !== '') {
      sharedContext = `Current Working Directory: ${cwd}\nDirectory Contents:\n${dirContext}${fileContext}`;
    }

    const systemPrompt = `You are a member of an elite AI Council. 
The user will give you a prompt. It is up to YOU to decide if the prompt is a practical task (requiring filesystem execution) or a theoretical/conversational question.

${sharedContext ? `Available Workspace Context:\n${sharedContext}` : 'No specific workspace context was provided.'}

- If the prompt is theoretical, philosophical, or conversational: Debate the topic, ignore the workspace, and leave the "command" field blank ("").
- If the prompt is practical: Evaluate the task against the workspace context, formulate a plan, and output a shell command to execute it.

You MUST output your response strictly as a JSON object matching this schema:
{
  "agentName": "Name of your model",
  "opinion": "Your detailed reasoning",
  "command": "Your shell command (leave blank if theoretical)",
  "vote": "APPROVE | REJECT | AMEND",
  "confidence": number 0-100,
  "highlights": ["Key Takeaway 1", "Key Takeaway 2"]
}

CRITICAL: For the 'command', ALWAYS use double quotes (") instead of single quotes (') because the system runs on Windows cmd.exe.`;

    // === ITERATIVE COUNCIL LOOP ===
    let allDebateResults: AgentResponse[] = [];
    let roundResults: AgentResponse[] = [];
    let consensus = false;
    let roundsTaken = 0;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      roundsTaken = round;
      iterationCounter.add(1, { task: taskPrompt.substring(0, 50) });

      // Build the user prompt — on round 1 it's just the task; on subsequent rounds, include prior debate
      let userPrompt = `Task: ${taskPrompt}`;
      
      if (round > 1 && roundResults.length > 0) {
        userPrompt += `\n\n--- PREVIOUS ROUND ${round - 1} DEBATE (models disagreed, please reconsider) ---`;
        for (const prev of roundResults) {
          userPrompt += `\n\n[${prev.agentName} — ${prev.role}] voted ${prev.vote} (confidence: ${prev.confidence}%):
"${prev.opinion}"`;
          if (prev.command) userPrompt += `\nProposed command: ${prev.command}`;
        }
        userPrompt += `\n\n--- Please review the above debate and provide your updated analysis. Try to reach consensus. ---`;
      }

      // Query all 3 agents in PARALLEL with the SAME shared context to save time
      const agentPromises = AGENTS.map(agent => queryAgent(agent, systemPrompt, userPrompt, round));
      roundResults = await Promise.all(agentPromises);

      allDebateResults.push(...roundResults);

      // Check consensus
      const hasReject = roundResults.some(r => r.vote === 'REJECT');
      if (!hasReject) {
        consensus = true;
        console.log(`[Council] Consensus reached on round ${round}`);
        break;
      }

      console.log(`[Council] Round ${round}: disagreement detected, ${round < MAX_ROUNDS ? 'iterating...' : 'max rounds reached'}`);
    }

    // Calculate confidence from APPROVE-only models (football possession style)
    const approvers = roundResults.filter(r => r.vote === 'APPROVE');
    const rejecters = roundResults.filter(r => r.vote === 'REJECT');
    const approveCount = approvers.length;
    const rejectCount = rejecters.length;
    const totalVotes = roundResults.length;

    const approveRate = totalVotes > 0 ? Math.round((approveCount / totalVotes) * 100) : 0;
    const rejectRate = totalVotes > 0 ? Math.round((rejectCount / totalVotes) * 100) : 0;

    // Confidence = average of APPROVE-voting models only
    const overallConfidence = approvers.length > 0
      ? Math.round(approvers.reduce((acc, a) => acc + a.confidence, 0) / approvers.length)
      : 0;

    const status = consensus ? 'CONSENSUS_REACHED' : 'DISAGREEMENT';

    consensusGauge.record(overallConfidence, { task: taskPrompt.substring(0, 50) });
    span.setAttribute('council.confidence', overallConfidence);
    span.setAttribute('council.consensus', status);
    span.setAttribute('council.rounds', roundsTaken);
    span.setAttribute('council.approve_rate', approveRate);

    // Pick the best command from the highest-confidence approver (or architect as fallback)
    const bestApprover = approvers.sort((a, b) => b.confidence - a.confidence)[0];
    const architect = roundResults.find(r => r.agentName === 'Llama-3.3-70B');
    const finalSource = bestApprover || architect || roundResults[0];

    const decision: CouncilDecision = {
      task: taskPrompt,
      status,
      overallConfidence,
      approveRate,
      rejectRate,
      finalPlan: finalSource.opinion,
      finalCommand: finalSource.command || '',
      agentDebates: allDebateResults, // includes all rounds
      roundsTaken,
    };

    // Log to telemetry database
    try {
      const db = await getDb();
      const totalTokens = allDebateResults.reduce((acc, r) => acc + r.tokensUsed, 0);
      
      // Insert main deliberation log
      const result = await db.run(
        'INSERT INTO telemetry_logs (token_burn, confidence_score, status, task_prompt, rounds_taken) VALUES (?, ?, ?, ?, ?)',
        [totalTokens, overallConfidence, status, taskPrompt, roundsTaken]
      );
      const deliberationId = result.lastID;

      // Insert per-agent, per-round logs
      for (const agentResult of allDebateResults) {
        await db.run(
          'INSERT INTO telemetry_agent_logs (deliberation_id, round, agent_name, vote, confidence, tokens_used, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [deliberationId, agentResult.round, agentResult.agentName, agentResult.vote, agentResult.confidence, agentResult.tokensUsed, agentResult.latencyMs]
        );
      }
    } catch (e) {
      console.error('[Engine] Failed to log telemetry to DB', e);
    }

    span.end();
    return decision;
  });
}
