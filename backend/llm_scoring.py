import os
import json
import re
from groq import Groq
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Groq client
client = Groq(api_key=os.environ.get("GROQ_KEY"))

MODEL_NAME = "llama-3.3-70b-versatile"

def score_resume(job_desc: str, resume_text: str) -> dict:
    """
    Uses Groq Llama 3.3 model to score a resume against a job description.
    Returns a dict: { "score": int, "reason": str, "email": str | None }
    """
    prompt = f"""You are an expert technical recruiter. Analyze the candidate's resume against the job description below.

Job Description:
{job_desc}

Resume:
{resume_text}

Score the candidate from 1 to 10 based on:
- Skill match with required technologies / tools
- Relevant work experience
- Overall relevance to the role

Also extract the candidate's email address from the resume text. If no email is found, use null.

Return ONLY a valid JSON object in this exact format (no markdown, no extra text, no code fences):
{{"score": <number 1-10>, "reason": "<one concise paragraph explaining the score>", "email": "<candidate email or null>"}}"""

    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model=MODEL_NAME,
            response_format={"type": "json_object"}
        )
        
        raw = chat_completion.choices[0].message.content.strip()

        # Strip any accidental markdown fences if the model still provides them
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        result = json.loads(raw)
        email = result.get("email")
        # Treat the string "null" or empty string as None
        if not email or str(email).strip().lower() in ("null", "none", ""):
            email = None
        return {
            "score": int(result.get("score", 0)),
            "reason": result.get("reason", ""),
            "email": email,
        }

    except Exception as e:
        return {"score": 0, "reason": f"Groq scoring failed: {str(e)}", "email": None}