import os
import uuid
import asyncio
import json
from urllib.parse import urlencode
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

from datetime import datetime, timezone, timedelta
from pdf_analysier import extract_text_from_pdf, save_candidate, get_top_candidates, get_candidate_by_id, update_candidate_interview_score
from llm_scoring import score_resume, run_interview_turn

import websockets

app = FastAPI(title="AI Resume Matcher API")

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InterviewMessage(BaseModel):
    role: str
    content: str


class InterviewTurnRequest(BaseModel):
    role_title: str = "Software Engineer"
    candidate_name: str = ""
    history: List[InterviewMessage] = []


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"message": "AI Resume Matcher API is running ✅"}


@app.get("/api/interview/{interview_id}/verify")
def verify_interview(interview_id: str):
    candidate = get_candidate_by_id(interview_id)
    if not candidate:
        raise HTTPException(
            status_code=404, detail="Interview not found or invalid link.")

    # Check 24 hours validity
    created_at_str = candidate.get("created_at")
    if created_at_str:
        try:
            # Supabase created_at looks like "2023-10-25T14:30:00+00:00" or similar
            created_at = datetime.fromisoformat(
                created_at_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > created_at + timedelta(hours=24):
                raise HTTPException(
                    status_code=403, detail="Interview link has expired.")
        except ValueError:
            pass  # Ignore if parsing fails

    return {"status": "valid", "candidate_name": candidate.get("name"), "role_title": "Software Engineer"}


@app.post("/api/interview/{interview_id}/message")
def interview_message(interview_id: str, payload: InterviewTurnRequest):
    """
    Continue an LLM-led interview for a candidate.
    The frontend owns the transcript and sends it with each turn.
    """
    candidate = get_candidate_by_id(interview_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    # Check 24 hours validity
    created_at_str = candidate.get("created_at")
    if created_at_str:
        try:
            created_at = datetime.fromisoformat(
                created_at_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > created_at + timedelta(hours=24):
                raise HTTPException(
                    status_code=403, detail="Interview link has expired.")
        except ValueError:
            pass

    cleaned_history = [
        {
            "role": message.role if message.role in {"user", "assistant"} else "user",
            "content": message.content.strip(),
        }
        for message in payload.history
        if message.content and message.content.strip()
    ]

    result = run_interview_turn(
        interview_id=interview_id,
        role_title=payload.role_title,
        candidate_name=candidate.get("name") or payload.candidate_name,
        history=cleaned_history,
        job_description=candidate.get("job_description", ""),
        resume_text=candidate.get("resume_text", ""),
    )

    if result.get("finished") and result.get("score") is not None:
        update_candidate_interview_score(interview_id, result["score"])

    return result


# ── Upload + Score + Save ─────────────────────────────────────────────────────
@app.post("/api/upload")
async def upload_resumes(
    job_description: str = Form(...),
    job_id: str = Form(None),
    files: List[UploadFile] = File(...)
):
    """
    1. Accept multiple PDF resumes + a job description.
    2. Extract text from each PDF.
    3. Ask Gemini LLM to score each resume against the JD.
    4. Save every candidate (with score) to Supabase.
    5. Return results sorted by score (best first).
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    if not job_id:
        job_id = str(uuid.uuid4())
    results = []

    for file in files:
        fname = file.filename or "unknown.pdf"

        if not fname.lower().endswith(".pdf"):
            results.append({
                "filename": fname,
                "status": "skipped",
                "message": "Not a PDF file",
                "score": None
            })
            continue

        try:
            file_bytes = await file.read()

            # Step 1 – Extract text
            resume_text = extract_text_from_pdf(file_bytes)

            # Step 2 – LLM scoring (also extracts candidate email)
            llm_result = score_resume(job_description, resume_text)
            score = llm_result["score"]
            reason = llm_result["reason"]
            # may be None if not found in resume
            email = llm_result.get("email")

            # Step 3 – Derive candidate name from filename
            name = os.path.splitext(fname)[0]

            # Step 4 – Save to Supabase
            saved = save_candidate(
                name=name,
                resume_text=resume_text,
                job_id=job_id,
                score=score,
                reason=reason,
                status="scored",
                job_description=job_description
            )

            results.append({
                "filename": fname,
                "status": "success",
                "score": score,
                "reason": reason,
                "email": email,
                "candidate_id": saved.get("id")
            })

        except Exception as e:
            results.append({
                "filename": fname,
                "status": "error",
                "message": str(e),
                "score": None
            })

    # Sort results: errors/skips at bottom, scored candidates by score desc
    results.sort(key=lambda x: (
        x.get("score") is None, -(x.get("score") or 0)))

    return {
        "job_id": job_id,
        "total": len(files),
        "processed": sum(1 for r in results if r["status"] == "success"),
        "results": results,
    }


# ── Get top candidates for a job ──────────────────────────────────────────────
@app.get("/api/candidates/{job_id}")
def get_candidates(job_id: str, limit: int = 20):
    """Retrieve the top-scored candidates for a given job_id from Supabase."""
    candidates = get_top_candidates(job_id=job_id, limit=limit)
    return {"job_id": job_id, "candidates": candidates}


# ── Deepgram WebSocket Transcription Proxy ────────────────────────────────────
@app.websocket("/ws/transcribe/{interview_id}")
async def transcribe_ws(websocket: WebSocket, interview_id: str):
    """
    Proxy audio from the frontend to Deepgram's streaming STT API.
    Relays transcripts and speech-final events back to the frontend.
    """
    await websocket.accept()

    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        await websocket.close(code=1011, reason="Deepgram API key not configured")
        return

    # Build Deepgram streaming URL with options
    params = {
        "model": "nova-2",
        "smart_format": "true",
        "interim_results": "true",
        "endpointing": "300",
    }
    dg_url = f"wss://api.deepgram.com/v1/listen?{urlencode(params)}"
    dg_headers = [("Authorization", f"Token {api_key}")]

    dg_ws = None
    tasks = []

    try:
        dg_ws = await websockets.connect(dg_url, additional_headers=dg_headers)
        print(f"[Deepgram] Connected for interview {interview_id}")
    except Exception as e:
        print(f"[Deepgram] Connection failed: {e}")
        await websocket.close(code=1011, reason="Failed to connect to Deepgram")
        return

    # Signal to stop both tasks
    stop = asyncio.Event()

    async def frontend_to_deepgram():
        """Read audio from browser, forward to Deepgram."""
        try:
            while not stop.is_set():
                message = await websocket.receive()
                msg_type = message.get("type", "")

                if msg_type == "websocket.disconnect":
                    print("[WS] Frontend disconnected")
                    stop.set()
                    break

                if msg_type == "websocket.receive":
                    if "bytes" in message and message["bytes"]:
                        await dg_ws.send(message["bytes"])
                    elif "text" in message and message["text"]:
                        try:
                            data = json.loads(message["text"])
                            if data.get("action") == "close":
                                print("[WS] Frontend sent close")
                                stop.set()
                                break
                        except json.JSONDecodeError:
                            pass
        except WebSocketDisconnect:
            print("[WS] Frontend disconnected (exception)")
            stop.set()
        except Exception as e:
            print(f"[WS] frontend_to_deepgram error: {e}")
            stop.set()

    async def deepgram_to_frontend():
        """Read transcripts from Deepgram, forward to browser."""
        try:
            async for raw_message in dg_ws:
                if stop.is_set():
                    break
                try:
                    data = json.loads(raw_message)
                    msg_type = data.get("type", "")

                    if msg_type == "Metadata":
                        print("[Deepgram] Metadata received")
                        continue

                    if msg_type == "Results":
                        channel = data.get("channel", {})
                        alternatives = channel.get("alternatives", [])
                        transcript = alternatives[0].get(
                            "transcript", "") if alternatives else ""
                        is_final = data.get("is_final", False)
                        speech_final = data.get("speech_final", False)

                        if transcript or is_final:
                            try:
                                await websocket.send_json({
                                    "type": "transcript",
                                    "data": {
                                        "transcript": transcript,
                                        "is_final": is_final,
                                        "speech_final": speech_final,
                                    }
                                })
                            except Exception:
                                stop.set()
                                break

                    elif msg_type == "UtteranceEnd":
                        try:
                            await websocket.send_json({"type": "speech_final"})
                        except Exception:
                            stop.set()
                            break

                except json.JSONDecodeError:
                    pass
        except websockets.exceptions.ConnectionClosed:
            print("[Deepgram] Connection closed")
        except Exception as e:
            print(f"[Deepgram] deepgram_to_frontend error: {e}")
        finally:
            stop.set()

    try:
        t1 = asyncio.create_task(frontend_to_deepgram())
        t2 = asyncio.create_task(deepgram_to_frontend())
        tasks = [t1, t2]

        # Wait until either task signals stop
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)

        # Cancel remaining tasks
        stop.set()
        for t in pending:
            t.cancel()
        await asyncio.gather(*pending, return_exceptions=True)

    except Exception as e:
        print(f"[WS] Proxy error: {e}")
    finally:
        if dg_ws:
            try:
                await dg_ws.close()
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
        print(f"[WS] Session {interview_id} cleaned up")
