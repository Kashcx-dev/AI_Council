from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import json
import asyncio
import os
import re
from dotenv import load_dotenv
from openai import AsyncOpenAI
import cognee
import datetime
from duckduckgo_search import DDGS

# Tools schema definitions for LLM tool calling
tools_schema = [
    {
        "type": "function",
        "function": {
            "name": "create_file",
            "description": "Create or overwrite a file in the workspace directory with the given content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {"type": "string", "description": "The name of the file, e.g. summary.txt"},
                    "content": {"type": "string", "description": "The text content to write."}
                },
                "required": ["filename", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_file",
            "description": "Delete a file in the workspace directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {"type": "string", "description": "The name of the file to delete, e.g. old_notes.txt"}
                },
                "required": ["filename"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "Get the current local date and time.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the live web for real-time information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query."}
                },
                "required": ["query"]
            }
        }
    }
]

def execute_tool(name, args, workspace_dir):
    try:
        if name == "create_file":
            filename = args.get("filename")
            content = args.get("content")
            if not filename or not content:
                return "Error: missing filename or content"
            target_dir = workspace_dir if (workspace_dir and os.path.isdir(workspace_dir)) else os.getcwd()
            filepath = os.path.join(target_dir, filename)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            return f"Success: file {filename} created at {target_dir}"
            
        elif name == "delete_file":
            filename = args.get("filename")
            if not filename:
                return "Error: missing filename"
            target_dir = workspace_dir if (workspace_dir and os.path.isdir(workspace_dir)) else os.getcwd()
            filepath = os.path.join(target_dir, filename)
            if os.path.exists(filepath):
                os.remove(filepath)
                return f"Success: file {filename} deleted from {target_dir}"
            else:
                return f"Error: file {filename} does not exist in {target_dir}"
            
        elif name == "get_current_time":
            return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
        elif name == "web_search":
            query = args.get("query")
            if not query:
                return "Error: missing query"
            results = DDGS().text(query, max_results=3)
            if not results:
                return "No search results found."
            import json
            return json.dumps(results)
            
        else:
            return f"Error: unknown tool {name}"
    except Exception as e:
        return f"Error executing {name}: {e}"


load_dotenv()

app = FastAPI()

# Initialize API client
client = AsyncOpenAI(
    base_url=os.getenv("LLM_ENDPOINT", "https://generativelanguage.googleapis.com/v1beta/openai/"),
    api_key=os.getenv("LLM_API_KEY", "")
)
MODEL_NAME = os.getenv("LLM_MODEL", "gemini-1.5-flash").replace("openai/", "").replace("gemini/", "")

@app.on_event("startup")
async def startup_event():
    print("[INIT] Connecting to Cognee Cloud...")
    try:
        await cognee.serve(
            url="https://tenant-755ffd87-3704-451b-a70a-834ece607d45.aws.cognee.ai",
            api_key="fb1f0edcedafcb0122c51ccb619c354e2b2c3518d19e784c84b706d2378a7a7b"
        )
        print("[INIT] Connected to Cognee Cloud!")
    except Exception as e:
        print(f"[ERROR] Failed to connect to Cognee Cloud: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    try:
        if hasattr(cognee, "disconnect"):
            await cognee.disconnect()
    except Exception:
        pass

chat_histories = {}
ingested_workspaces = set()

def needs_recall(text):
    """Detect if the user is asking about something that might be in memory."""
    lower = text.lower().strip()

    # Questions that reference stored knowledge
    recall_starters = [
        "what is", "what are", "what was", "what were",
        "who is", "who are", "who was",
        "when is", "when was", "when do",
        "where is", "where was",
        "how much", "how many",
        "tell me about", "tell me what", "remind me",
        "do you remember", "do you know",
        "what do you know about",
        "can you recall", "look up", "search for",
        "summarize", "summary of",
    ]

    # References to stored context
    recall_keywords = [
        "pending", "task", "tasks", "to do", "todo", "to-do",
        "meeting", "deadline", "schedule",
        "candidate", "recruit", "salary", "deal",
        "my project", "my code", "my file", "my work",
        "earlier", "before", "previously", "last time",
    ]

    # It's a question
    if "?" in text:
        return True

    for phrase in recall_starters:
        if lower.startswith(phrase):
            return True

    for keyword in recall_keywords:
        if keyword in lower:
            return True

    return False


def needs_remember(text):
    """Detect if the user wants to store new information."""
    lower = text.lower().strip()

    remember_phrases = [
        "remember this", "remember that", "don't forget",
        "note this", "note that", "keep in mind",
        "save this", "store this", "add to memory",
        "i added", "i changed", "i updated", "i created",
        "i removed", "i deleted", "i fixed", "i moved",
        "new update:", "update:", "fyi", "for your information",
        "here is some info", "here's some info",
        "important:", "note:", "reminder:",
    ]

    return any(phrase in lower for phrase in remember_phrases)

async def try_remember(text):
    """Store text into Cognee's graph memory."""
    try:
        print(f"[REMEMBER] Storing: {text[:80]}...")
        await cognee.remember(text)
        print("[REMEMBER] Success")
        return True
    except Exception as e:
        print(f"[REMEMBER] Failed: {e}")
        return False


async def try_recall(query):
    """Search Cognee's graph memory and return results as a string."""
    try:
        print(f"[RECALL] Searching: {query}")
        results = await cognee.recall(query)
        if not results:
            print("[RECALL] No results found")
            return ""
        
        parsed_results = []
        for res in results:
            if isinstance(res, dict) and "text" in res:
                parsed_results.append(res["text"])
            else:
                parsed_results.append(str(res))
                
        result_text = "\n".join(parsed_results)
        print(f"[RECALL] Found {len(results)} results")
        return result_text
    except Exception as e:
        print(f"[RECALL] Failed: {e}")
        return ""

@app.get("/")
def read_root():
    return {"status": "Violet AI Service Running"}


@app.websocket("/ws/cognee")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[OK] Node.js Backend connected to Python Cognee service")
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            chat_id = payload.get("chatId")
            text = payload.get("text")
            workspace_dir = payload.get("workspaceDir", "")

            print(f"[IN] Chat {chat_id}: {text}")

            # Initialize chat history if new
            if chat_id not in chat_histories:
                chat_histories[chat_id] = [
                    {"role": "system", "content": (
                        "You are Violet, the next gen AI. You are an incredibly decisive, assertive, and proactive personal assistant. "
                        "You act as a highly capable executive agent. When asked for advice, you do NOT give wishy-washy "
                        "answers or say 'it's your choice in the end.' You analyze the situation, pick the BEST option, "
                        "and confidently tell the user exactly what they should do. "
                        "You have access to a persistent graph memory and live agentic tools (file creation, web search, time). "
                        "Use these tools autonomously whenever they are needed to complete the user's request. "
                        "When memory context is provided, use it to inform your decisions."
                    )}
                ]

            # Ingest workspace ONCE on first message for this chat
            if workspace_dir and chat_id not in ingested_workspaces:
                if os.path.isdir(workspace_dir):
                    print(f"[DIR] Ingesting workspace files from: {workspace_dir}")
                    success = True
                    for filename in os.listdir(workspace_dir):
                        if filename.endswith(".txt") or filename.endswith(".md"):
                            filepath = os.path.join(workspace_dir, filename)
                            try:
                                with open(filepath, "r", encoding="utf-8") as f:
                                    content = f.read()
                                    if content.strip():
                                        print(f"      -> Uploading {filename} to Cognee Cloud...")
                                        # Send the actual text content to the cloud
                                        await try_remember(f"File: {filename}\nContent: {content}")
                            except Exception as e:
                                print(f"      -> Failed to read {filename}: {e}")
                                success = False
                    
                    if success:
                        ingested_workspaces.add(chat_id)

            do_recall = needs_recall(text)
            do_remember = needs_remember(text)
            print(f"[INTENT] recall={do_recall}, remember={do_remember}")
            if do_remember:
                await try_remember(text)

            memory_context = ""
            if do_recall:
                memory_context = await try_recall(text)

            messages = list(chat_histories[chat_id])
            if memory_context:
                messages.append({
                    "role": "system",
                    "content": f"Relevant information from your memory:\n{memory_context}"
                })

            messages.append({"role": "user", "content": text})

            try:
                pass1_response = await client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=messages,
                    tools=tools_schema,
                    tool_choice="auto",
                    stream=False
                )
            except Exception as e:
                print(f"[ERROR] LLM Tool Pass failed: {e}")
                await websocket.send_text(json.dumps({
                    "type": "chat_stream",
                    "chatId": chat_id,
                    "chunk": f"Error: {e}",
                    "isLast": True
                }))
                continue

            msg = pass1_response.choices[0].message
            if msg.content or msg.tool_calls:
                msg_dict = msg.model_dump(exclude_unset=True)
                messages.append(msg_dict)
                
            stream = None
            if msg.tool_calls:
                print(f"[TOOL] Triggered {len(msg.tool_calls)} tools")
                for tool_call in msg.tool_calls:
                    print(f"      -> {tool_call.function.name}")
                    args = json.loads(tool_call.function.arguments)
                    result = execute_tool(tool_call.function.name, args, workspace_dir)
                    
                    if tool_call.function.name in ["create_file", "delete_file"]:
                        action = "created" if tool_call.function.name == "create_file" else "deleted"
                        filename = args.get("filename", "a file")
                        await websocket.send_text(json.dumps({
                            "type": "system_event",
                            "chatId": chat_id,
                            "text": f"Violet has {action} {filename}"
                        }))

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": tool_call.function.name,
                        "content": result
                    })
                
                try:
                    stream = await client.chat.completions.create(
                        model=MODEL_NAME,
                        messages=messages,
                        stream=True
                    )
                except Exception as e:
                    print(f"[ERROR] LLM Stream Pass failed: {e}")
                    await websocket.send_text(json.dumps({
                        "type": "chat_stream",
                        "chatId": chat_id,
                        "chunk": f"Error: {e}",
                        "isLast": True
                    }))
                    continue

            full_reply = ""
            if stream:
                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_reply += content
                        is_last = chunk.choices[0].finish_reason is not None
                        await websocket.send_text(json.dumps({
                            "type": "chat_stream",
                            "chatId": chat_id,
                            "chunk": content,
                            "isLast": is_last
                        }))
                        if is_last:
                            break
            else:
                content = msg.content or ""
                full_reply += content
                await websocket.send_text(json.dumps({
                    "type": "chat_stream",
                    "chatId": chat_id,
                    "chunk": content,
                    "isLast": True
                }))

            # Ensure we always send isLast=True
            if full_reply and (stream is not None):
                await websocket.send_text(json.dumps({
                    "type": "chat_stream",
                    "chatId": chat_id,
                    "chunk": "",
                    "isLast": True
                }))

            if full_reply:
                chat_histories[chat_id].append({"role": "user", "content": text})
                chat_histories[chat_id].append({"role": "assistant", "content": full_reply})
                if len(chat_histories[chat_id]) > 21:
                    chat_histories[chat_id] = chat_histories[chat_id][:1] + chat_histories[chat_id][-20:]

    except WebSocketDisconnect:
        print("[DC] Node.js Backend disconnected")
    except Exception as e:
        print(f"[ERROR] Error in websocket: {e}")
