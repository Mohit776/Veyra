import os
import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List

from pdf_analysier import extract_text_from_pdf, save_candidate, get_top_candidates
from llm_scoring import score_resume

app = FastAPI(title="AI Resume Matcher API")

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],   # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"message": "AI Resume Matcher API is running ✅"}


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
            email = llm_result.get("email")  # may be None if not found in resume

            # Step 3 – Derive candidate name from filename
            name = os.path.splitext(fname)[0]

            # Step 4 – Save to Supabase
            saved = save_candidate(
                name=name,
                resume_text=resume_text,
                job_id=job_id,
                score=score,
                reason=reason,
                status="scored"
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
    results.sort(key=lambda x: (x.get("score") is None, -(x.get("score") or 0)))

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