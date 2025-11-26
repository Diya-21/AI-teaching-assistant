# main.py - Full FastAPI backend (FastAPI + Google Gemini)
# Features:
# - File upload (PDF/DOCX/TXT)
# - Chunking + simple RAG (search by word overlap)
# - Chat endpoint with Teaching Mode + Simplify Mode (auto-detect + manual flag)
# - Quiz generator
# - YouTube agent (search + transcripts + timestamps) - optional packages
# - Persistent in-memory storage for uploaded docs, chat history, quizzes (survives frontend navigation)
# - Endpoints to fetch stored histories
#
# NOTE: This is intended to be a drop-in replacement for your earlier app that used
# genai.GenerativeModel from google.generativeai. Make sure GEMINI_API_KEY is set in .env.
# Run with: uvicorn main:app --reload

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import google.generativeai as genai
import os
from dotenv import load_dotenv
import PyPDF2
import docx
from io import BytesIO
import time

# YouTube imports (optional)
try:
    from youtube_search import YoutubeSearch
    from youtube_transcript_api import YouTubeTranscriptApi
    YOUTUBE_AVAILABLE = True
    print("✅ YouTube packages loaded")
except Exception:
    YOUTUBE_AVAILABLE = False
    print("⚠️ YouTube packages not installed. (Optional) pip install youtube-search-python youtube-transcript-api")

# Load env
load_dotenv()

# FastAPI app
app = FastAPI(title="AI Teaching Assistant - Full Version (Gemini)")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("❌ GEMINI_API_KEY not found in .env")

genai.configure(api_key=GEMINI_API_KEY)

# Try to initialize a working Gemini model (try multiple fallbacks)
print("🔄 Initializing Gemini model...")
model = None
MODEL_CANDIDATES = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-flash-latest',
    'gemini-pro-latest',
]
for mn in MODEL_CANDIDATES:
    try:
        candidate = genai.GenerativeModel(mn)
        test = candidate.generate_content("Say OK")
        if test and getattr(test, "text", None):
            model = candidate
            print(f"  ✅ Using model: {mn}")
            break
    except Exception as e:
        print(f"  ❌ {mn} init failed: {type(e).__name__}: {e}")
if model is None:
    raise RuntimeError("❌ No Gemini model could be initialized. Check API key and network.")

print("✅ Gemini ready!")

# -------------------------
# In-memory persistent storage
# -------------------------
# Note: For production use a database (SQLite, Postgres, Firebase, etc.). In memory is fine for demo.
uploaded_documents: List[Dict[str, Any]] = []  # each: {filename, text, chunks, uploaded_at}
chat_histories: List[Dict[str, Any]] = []     # store chronological chat entries: {id, user_message, assistant_response, timestamp, mode, sources}
quizzes_store: List[Dict[str, Any]] = []      # store generated quizzes
# Optionally, you can map by user/session id if you have authentication.

# -------------------------
# Pydantic models (API)
# -------------------------
class ChatRequest(BaseModel):
    message: str
    chat_history: Optional[List[dict]] = []  # frontend may send previous exchange for context
    simplify_mode: Optional[bool] = False
    mode: Optional[str] = "normal"  # normal | simplified | deepdive (optional)

class QuizRequest(BaseModel):
    topic: str
    difficulty: str
    num_questions: int = 5

class VideoSearchRequest(BaseModel):
    query: str
    max_videos: int = 3

class YouTubeDoubtRequest(BaseModel):
    doubt: str
    max_videos: int = 2

# -------------------------
# Utilities (file extraction, chunking, search)
# -------------------------
def extract_pdf(content: bytes) -> str:
    reader = PyPDF2.PdfReader(BytesIO(content))
    pages_text = []
    for p in reader.pages:
        text = p.extract_text() or ""
        pages_text.append(text)
    return "\n".join(pages_text)

def extract_docx(content: bytes) -> str:
    doc = docx.Document(BytesIO(content))
    paras = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paras)

def chunk_text(text: str, size: int = 500, overlap: int = 50) -> List[str]:
    """Simple word-based chunking"""
    words = text.split()
    if not words:
        return []
    chunks = []
    step = size - overlap
    for i in range(0, len(words), step):
        chunk = " ".join(words[i:i + size])
        if chunk.strip():
            chunks.append(chunk)
    return chunks

def search_chunks(query: str, chunks: List[str], top_k: int = 3) -> List[str]:
    """Very simple overlap-based scoring for demo. Replace with vector DB for production."""
    query_terms = set(query.lower().split())
    scored = []
    for c in chunks:
        c_terms = set(c.lower().split())
        overlap = len(query_terms & c_terms)
        if overlap > 0:
            scored.append((overlap, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:top_k]]

def format_time(seconds: float) -> str:
    s = int(seconds)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    else:
        return f"{m}:{s:02d}"

# -------------------------
# YouTube Agent
# -------------------------
class YouTubeAgent:
    def search_videos(self, query: str, max_results: int = 3) -> List[Dict[str, Any]]:
        if not YOUTUBE_AVAILABLE:
            return []
        try:
            results = YoutubeSearch(f"{query} tutorial explanation", max_results=max_results).to_dict()
            videos = []
            for r in results:
                vid = {
                    'video_id': r.get('id'),
                    'title': r.get('title'),
                    'channel': r.get('channel'),
                    'duration': r.get('duration'),
                    'views': r.get('views'),
                    'url': f"https://www.youtube.com/watch?v={r.get('id')}",
                    'thumbnail': r.get('thumbnails')[0] if r.get('thumbnails') else None
                }
                videos.append(vid)
            return videos
        except Exception as e:
            print("YouTube search error:", e)
            return []

    def get_transcript(self, video_id: str):
        if not YOUTUBE_AVAILABLE:
            return None
        try:
            return YouTubeTranscriptApi.get_transcript(video_id)
        except Exception:
            return None

    def find_timestamps(self, video_id: str, doubt: str, top_k: int = 3):
        transcript = self.get_transcript(video_id)
        if not transcript:
            return []
        # Build 60-second segments
        segments = []
        cur = {'text': '', 'start': 0, 'end': 0}
        for entry in transcript:
            start = entry.get('start', 0)
            text = entry.get('text', '')
            if start - cur['start'] >= 60 and cur['text']:
                segments.append(cur)
                cur = {'text': '', 'start': start, 'end': start}
            cur['text'] += " " + text
            cur['end'] = start + entry.get('duration', 3)
        if cur['text']:
            segments.append(cur)
        # Score segments
        doubt_words = set(doubt.lower().split())
        scored = []
        for seg in segments:
            seg_words = set(seg['text'].lower().split())
            overlap = len(seg_words & doubt_words)
            if overlap > 0:
                score = int((overlap / (len(doubt_words) if doubt_words else 1)) * 100)
                scored.append({
                    'start_time': seg['start'],
                    'timestamp_formatted': format_time(seg['start']),
                    'url_with_timestamp': f"https://www.youtube.com/watch?v={video_id}&t={int(seg['start'])}s",
                    'text_preview': seg['text'][:160] + '...',
                    'relevance_score': score
                })
        scored.sort(key=lambda x: x['relevance_score'], reverse=True)
        return scored[:top_k]

    def process_doubt(self, doubt: str, max_videos: int = 2):
        videos = self.search_videos(doubt, max_videos)
        if not videos:
            return {'success': False, 'message': 'No videos found', 'videos': []}
        results = []
        for v in videos:
            timestamps = self.find_timestamps(v['video_id'], doubt, top_k=3)
            v['relevant_timestamps'] = timestamps
            v['has_timestamps'] = len(timestamps) > 0
            results.append(v)
        return {
            'success': True,
            'doubt': doubt,
            'videos': results,
            'total_videos': len(results),
            'total_timestamps': sum(len(v['relevant_timestamps']) for v in results)
        }

youtube_agent = YouTubeAgent() if YOUTUBE_AVAILABLE else None

# -------------------------
# Helper: store chat in server-side history
# -------------------------
def save_chat_entry(user_message: str, assistant_response: str, mode: str, sources_used: List[str]):
    entry = {
        'id': len(chat_histories) + 1,
        'user_message': user_message,
        'assistant_response': assistant_response,
        'timestamp': time.time(),
        'mode': mode,
        'sources_used': sources_used
    }
    chat_histories.append(entry)
    return entry

# -------------------------
# Endpoints
# -------------------------
@app.get("/")
async def root():
    return {
        "message": "AI Teaching Assistant API is running!",
        "status": "healthy",
        "features": {
            "upload": True,
            "chat": True,
            "quiz": True,
            "youtube_agent": YOUTUBE_AVAILABLE
        },
        "documents_uploaded": len(uploaded_documents),
        "chat_history_entries": len(chat_histories)
    }

@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "model_candidate": MODEL_CANDIDATES[0] if MODEL_CANDIDATES else "unknown",
        "documents": len(uploaded_documents),
        "chat_history": len(chat_histories)
    }

@app.post("/api/upload-syllabus")
async def upload_syllabus(file: UploadFile = File(...)):
    try:
        filename = file.filename
        content = await file.read()
        text = ""
        if filename.lower().endswith(".pdf"):
            text = extract_pdf(content)
        elif filename.lower().endswith(".docx"):
            text = extract_docx(content)
        elif filename.lower().endswith(".txt"):
            text = content.decode('utf-8')
        else:
            raise HTTPException(400, detail="Unsupported file type. Use PDF, DOCX, or TXT.")

        if len(text.strip()) < 50:
            raise HTTPException(400, detail="Uploaded file appears too short or empty.")

        chunks = chunk_text(text)
        doc_obj = {
            'filename': filename,
            'text': text,
            'chunks': chunks,
            'uploaded_at': time.time()
        }
        uploaded_documents.append(doc_obj)

        return {
            'status': 'success',
            'filename': filename,
            'chunks_created': len(chunks)
        }
    except Exception as e:
        raise HTTPException(500, detail=str(e))

# New endpoints to fetch stored stuff
@app.get("/api/documents")
async def list_documents():
    return {
        'count': len(uploaded_documents),
        'documents': [{'filename': d['filename'], 'uploaded_at': d['uploaded_at'], 'chunks': len(d['chunks'])} for d in uploaded_documents]
    }

@app.get("/api/chat-history")
async def get_chat_history(limit: int = 100):
    # Return the last `limit` chat entries (most recent first)
    items = chat_histories[-limit:]
    return {'count': len(items), 'items': items}

@app.delete("/api/clear-history")
async def clear_history():
    c = len(chat_histories)
    chat_histories.clear()
    return {'cleared': c}

# -------------------------
# Chat endpoint - major improvements
# -------------------------
@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Chat endpoint:
    - Uses in-memory uploaded_documents as retrieval source.
    - Has 'simplify' triggers and manual simplify_mode flag.
    - If user message is a 'simplify' trigger, it will attempt to simplify the last assistant response
      (prefers request.chat_history, falls back to server-side chat_histories).
    - Always instructs the model to *explain* rather than copy text.
    """
    try:
        user_msg = request.message.strip()
        print("💬 Chat request:", user_msg[:120])

        # 1) Determine simplify mode (auto trigger or manual)
        simplify_triggers = ["simplify", "explain again", "in simpler terms", "like i'm 10", "simpler", "easy explanation", "explain like i'm 10"]
        auto_trigger = any(t in user_msg.lower() for t in simplify_triggers)
        simplify_mode = bool(request.simplify_mode) or auto_trigger or (request.mode == "simplified")

        # 2) If user is asking to simplify and chat_history was provided, grab last assistant answer to rewrite
        #    Priority: request.chat_history (if frontend provided), else server-side chat_histories last entry.
        if auto_trigger and (request.chat_history and len(request.chat_history) > 0):
            # Expect chat_history to be a list of dicts where assistant messages present
            # Try to find last assistant response in provided chat_history
            last_assistant = None
            for item in reversed(request.chat_history):
                # item could be like {"role": "assistant", "text": "..."} or {"assistant": "..."}
                if isinstance(item, dict):
                    # common shapes:
                    if item.get('role') == 'assistant' and item.get('text'):
                        last_assistant = item.get('text')
                        break
                    if item.get('assistant_response'):
                        last_assistant = item.get('assistant_response')
                        break
                    # fallback: check keys
                    if 'response' in item:
                        last_assistant = item['response']
                        break
            if last_assistant:
                # Build a rewrite prompt that asks the model to simplify that assistant answer
                rewrite_prompt = f"""
You are an AI Teaching Assistant for AI & DS students. The student asked the assistant a question earlier,
and the assistant's previous reply is below. The student asked: "Please simplify that" or similar.

Rewrite the assistant's previous reply so it is:
- Simple and easy to understand (like explaining to a beginner or a 10-year-old).
- Use everyday analogies and short sentences.
- Keep it concise (3-6 short sentences).
- Add one quick AI-related example (like a chatbot or recommendation system) to make it concrete.
- Keep a friendly tone and include an emoji or two if helpful.

Previous assistant reply:
\"\"\"{last_assistant}\"\"\"

Simplified reply:
"""
                resp = model.generate_content(rewrite_prompt)
                simplified_text = resp.text if resp and getattr(resp, "text", None) else "Sorry, I couldn't simplify that."
                # Save to history
                entry = save_chat_entry(user_message=user_msg, assistant_response=simplified_text, mode="simplified", sources_used=[])
                return {
                    "response": simplified_text,
                    "mode": "Simplify (rewrite)",
                    "history_entry": entry
                }
            # If we couldn't find previous assistant text in provided chat_history, fallthrough to general behavior.

        # 3) Build context from uploaded_documents using simple retrieval
        all_chunks = []
        source_files = []
        for d in uploaded_documents:
            all_chunks.extend(d.get('chunks', []))
            source_files.append(d.get('filename'))

        context_chunks = []
        if all_chunks:
            context_chunks = search_chunks(user_msg, all_chunks, top_k=4)

        context_text = "\n\n".join(context_chunks)
        files_context = ""
        if source_files:
            files_context = f"(Referring to: {', '.join(source_files)})" if len(source_files) > 1 else f"(Referring to: {source_files[0]})"

        # 4) Teaching-style prompt construction
        if simplify_mode:
            teaching_style = """
You are in SIMPLIFY MODE. Explain as if speaking to a beginner or a 10-year-old.
- Use short sentences, everyday analogies, and emojis where appropriate.
- Avoid jargon. If a technical word is necessary, define it simply.
- Give one concrete AI or Data Science example (like chatbots or recommender systems).
- Keep it concise (3-6 short sentences)."""
        else:
            teaching_style = """
You are an AI Teaching Assistant specifically for Artificial Intelligence & Data Science (AI & DS) engineering students.
Your role: TEACH — not just summarize. Use intuition, examples, short code snippets (if relevant), and analogies.
- Break complex ideas into simple steps.
- Explain WHY things work and WHEN to use them.
- NEVER copy text verbatim from provided syllabus materials — use them only as background reference.
- Mention which uploaded file(s) you referenced if relevant.
- Keep answers concise unless the user asks for a deep dive.
"""

        # Add creative example nudge to ensure variety and branch-specific examples
        creative_example_injection = "\nAlso include one short, branch-specific example (AI/DS) related to the topic."

        # Compose final prompt for Gemini
        if context_text:
            final_prompt = f"""
{teaching_style}

Reference context (use only to inform your answer; do not copy): {files_context}
{context_text}

Student question:
\"\"\"{user_msg}\"\"\"

{creative_example_injection}

Write your answer now in a friendly, teaching style. If the question is ambiguous, explain the core idea and show what a clarifying follow-up question the student could ask.
"""
        else:
            final_prompt = f"""
{teaching_style}

Student question:
\"\"\"{user_msg}\"\"\"

{creative_example_injection}

Write your answer now in a friendly, teaching style. If the question is ambiguous, explain the core idea and show what a clarifying follow-up question the student could ask.
"""

        # 5) Call Gemini to generate answer
        gen = model.generate_content(final_prompt)
        assistant_text = gen.text if gen and getattr(gen, "text", None) else "Sorry, I couldn't generate a response."

        # 6) Save chat history server-side for persistence
        sources_used = [f for f in (source_files or [])] if context_chunks else []
        history_entry = save_chat_entry(user_message=user_msg, assistant_response=assistant_text, mode=("simplified" if simplify_mode else "normal"), sources_used=sources_used)

        # 7) If user wanted videos, optionally fetch them
        wants_video = any(word in user_msg.lower() for word in ['video', 'watch', 'youtube', 'visual', 'see'])
        video_data = None
        if wants_video and youtube_agent:
            try:
                video_data = youtube_agent.process_doubt(user_msg, max_videos=2)
            except Exception as e:
                video_data = {'success': False, 'message': str(e)}

        return {
            "response": assistant_text,
            "mode": ("Simplified" if simplify_mode else "Normal"),
            "sources_used_count": len(context_chunks),
            "references": files_context if context_text else "",
            "history_entry": history_entry,
            "has_videos": bool(video_data),
            "video_data": video_data
        }

    except Exception as e:
        print("❌ Chat error:", type(e).__name__, e)
        raise HTTPException(500, detail=str(e))

# -------------------------
# Quiz generation endpoint (keeps previous behavior)
# -------------------------
@app.post("/api/generate-quiz")
async def generate_quiz(request: QuizRequest):
    try:
        print(f"📝 Generating quiz on: {request.topic} (level: {request.difficulty})")

        # Combine all syllabus text
        all_chunks = []
        for doc in uploaded_documents:
            all_chunks.extend(doc['chunks'])
        
        context = ""
        if all_chunks:
            relevant = search_chunks(request.topic, all_chunks, top_k=5)
            context = "\n".join(relevant)

        prompt = f"""
You are an AI Teaching Assistant for AI & DS students.
Generate {request.num_questions} multiple-choice questions on the topic "{request.topic}" at {request.difficulty} level.

Use this context if relevant:
{context}

Format exactly like this:
Q1: [Question]
A) [Option]
B) [Option]
C) [Option]
D) [Option]
Correct Answer: [A/B/C/D]
Explanation: [Brief explanation]

Make sure each question has 4 options, one correct answer, and a clear explanation.
"""
        response = model.generate_content(prompt)

        text = response.text if response and response.text else ""
        questions = []
        current = {}

        # Parse text output safely
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("Q") and ":" in line:
                if current:
                    questions.append(current)
                current = {"question": line.split(":", 1)[1].strip(), "options": [], "correct_answer": "", "explanation": ""}
            elif line.startswith(("A)", "B)", "C)", "D)")):
                current["options"].append(line)
            elif line.lower().startswith("correct answer"):
                ans = line.split(":")[-1].strip()
                current["correct_answer"] = ans[0] if ans else "A"
            elif line.lower().startswith("explanation"):
                current["explanation"] = line.split(":", 1)[-1].strip()

        if current:
            questions.append(current)

        # ✅ Defensive fallback
        if not questions:
            return {
                "topic": request.topic,
                "difficulty": request.difficulty,
                "questions": [],
                "total": 0,
                "error": "Could not generate quiz properly. Try rephrasing the topic."
            }

        print(f"✅ Quiz generated successfully: {len(questions)} questions")

        return {
            "topic": request.topic,
            "difficulty": request.difficulty,
            "questions": questions,
            "total": len(questions)
        }

    except Exception as e:
        print(f"❌ Quiz generation error: {e}")
        raise HTTPException(500, f"Quiz generation failed: {str(e)}")

# -------------------------
# YouTube specific endpoints (if available)
# -------------------------
@app.post("/api/search-videos")
async def search_videos(request: VideoSearchRequest):
    if not youtube_agent:
        raise HTTPException(503, detail="YouTube agent not available. Install required packages.")
    try:
        result = youtube_agent.process_doubt(request.query, max_videos=request.max_videos)
        return result
    except Exception as e:
        raise HTTPException(500, detail=str(e))

@app.post("/api/youtube-doubt")
async def youtube_doubt(request: YouTubeDoubtRequest):
    if not youtube_agent:
        raise HTTPException(503, detail="YouTube agent not available.")
    try:
        res = youtube_agent.process_doubt(request.doubt, max_videos=request.max_videos)
        return res
    except Exception as e:
        raise HTTPException(500, detail=str(e))

# -------------------------
# Utility endpoints
# -------------------------
@app.delete("/api/clear-documents")
async def clear_documents():
    count = len(uploaded_documents)
    uploaded_documents.clear()
    return {'cleared_documents': count}

@app.get("/api/debug-state")
async def debug_state():
    return {
        'documents': len(uploaded_documents),
        'chats': len(chat_histories),
        'quizzes': len(quizzes_store),
    }

# -------------------------
# Run app
# -------------------------
if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("🎓 AI TEACHING ASSISTANT - Full Version (Gemini + Simplify Mode)")
    print("=" * 60)
    print(f"Documents: {len(uploaded_documents)} | Chat entries: {len(chat_histories)}")
    print("Run with: uvicorn main:app --reload")
    uvicorn.run(app, host="0.0.0.0", port=8000)
