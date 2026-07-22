# AI Council 🏛️🤖

An agentic multi-agent consensus system built for the **Agents of SigNoz** Hackathon.

## Overview
AI Council allows multiple specialized AI agents (Architect, Security Auditor, Critic) to deliberate, debate, and vote on complex tasks before presenting an approved action plan to the human. Once confirmed, an autonomous action engine (OpenClaw / Tool Runner) executes the task.

The entire deliberation loop, token cost, consensus latency, and execution spans are fully observed using **SigNoz (OpenTelemetry)**.

## Project Structure
- `server/` - Node.js + Express backend orchestrator & OpenTelemetry/SigNoz exporter.
- `client/` - Modern React + Vite UI dashboard for watching live agent debates and managing execution approvals.

## Quick Start
1. Install dependencies:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```
2. Start the Backend Server:
   ```bash
   cd server && npm run dev
   ```
3. Start the Frontend Dashboard:
   ```bash
   cd client && npm run dev
   ```
