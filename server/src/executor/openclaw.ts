import { tracer } from '../telemetry/signoz';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ExecutionResult {
  step: string;
  status: 'SUCCESS' | 'FAILED';
  output: string;
  durationMs: number;
}

export async function executeCouncilPlan(plan: string, cwd?: string, user?: any): Promise<ExecutionResult[]> {
  return tracer.startActiveSpan('openclaw_action_execution', async (span) => {
    span.setAttribute('execution.plan', plan);
    span.setAttribute('execution.cwd', cwd || 'unknown');
    if (user) {
      span.setAttribute('user.id', user.userId);
      span.setAttribute('user.username', user.username);
    }

    const results: ExecutionResult[] = [];
    const workingDir = cwd && cwd.trim() !== '' ? cwd : process.cwd();

    const result = await tracer.startActiveSpan(`tool_execution`, async (stepSpan) => {
      stepSpan.setAttribute('tool.step_name', 'Executing Architect Plan');
      const startTime = Date.now();
      
      let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let outputStr = '';
      
      try {
        // We'll extract bash commands if the AI wrapped them in ```bash...``` or just run the raw plan
        let commandToRun = plan;
        const bashMatch = plan.match(/```(?:bash|sh)\n([\s\S]*?)```/);
        if (bashMatch && bashMatch[1]) {
          commandToRun = bashMatch[1];
        } else if (plan.includes('```')) {
           const genericMatch = plan.match(/```\n([\s\S]*?)```/);
           if (genericMatch) commandToRun = genericMatch[1];
        }

        const { stdout, stderr } = await execAsync(commandToRun, { cwd: workingDir, timeout: 15000 });
        outputStr = stdout || stderr || 'Execution completed with no output.';
      } catch (err: any) {
        status = 'FAILED';
        outputStr = err.message || 'Execution failed';
      }

      const duration = Date.now() - startTime;
      const res: ExecutionResult = {
        step: 'Executing Architect Plan',
        status,
        output: outputStr,
        durationMs: duration,
      };

      stepSpan.setAttribute('tool.duration_ms', duration);
      stepSpan.end();
      return res;
    });

    results.push(result);
    span.end();
    return results;
  });
}
