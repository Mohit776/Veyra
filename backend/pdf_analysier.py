import io
import pdfplumber
from supabase import create_client, Client
from config import config

# Initialize Supabase client
url: str = config.SUPABASE_URL
key: str = config.SUPABASE_KEY

supabase: Client = create_client(url, key) if url and key else None


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract all text from a PDF given its raw bytes."""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages_text = [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(pages_text).strip()


def save_candidate(
    name: str,
    resume_text: str,
    job_id: str,
    score: int = 0,
    reason: str = "",
    status: str = "scored",
    **kwargs
) -> dict:
    """Insert a candidate record into Supabase and return the saved row."""
    if not supabase:
        raise ValueError(
            "Supabase client is not initialized. "
            "Check your SUPABASE_URL and SUPABASE_KEY in the .env file."
        )

    data = {
        "name": name,
        "resume_text": resume_text,
        "job_id": job_id,
        "score": score,
        "reason": reason,
        "status": status,
        "job_description": kwargs.get("job_description", "")
    }

    result = supabase.table("candidates").insert(data).execute()
    return result.data[0] if result.data else {}


def get_top_candidates(job_id: str, limit: int = 20) -> list:
    """Fetch top-scored candidates for a given job_id from Supabase."""
    if not supabase:
        return []

    result = (
        supabase.table("candidates")
        .select("*")
        .eq("job_id", job_id)
        .order("score", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []

def get_candidate_by_id(candidate_id: str) -> dict:
    if not supabase:
        return {}
    result = supabase.table("candidates").select("*").eq("id", candidate_id).execute()
    return result.data[0] if result.data else {}

def update_candidate_interview_score(candidate_id: str, interview_score: int) -> dict:
    if not supabase:
        return {}
    result = supabase.table("candidates").update({"interview_score": interview_score, "status": "interview_completed"}).eq("id", candidate_id).execute()
    return result.data[0] if result.data else {}