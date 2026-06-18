import json
import re
from groq import Groq
from config import config

# Initialize Groq client
client = Groq(api_key=config.GROQ_KEY)

MODEL_NAME = config.GROQ_MODEL

def run_interview_turn(
    interview_id: str,
    role_title: str,
    candidate_name: str,
    history: list[dict],
    job_description: str = "",
    resume_text: str = "",
) -> dict:
    """
    Uses the LLM as a structured interviewer.
    Returns a dict with: reply, stage, feedback, score, finished.
    """
    candidate_answers = [
        message for message in history if message.get("role") == "user"
    ]
    should_wrap = len(candidate_answers) >= 4

    transcript = "\n".join(
        f"{message.get('role', 'unknown').upper()}: {message.get('content', '')}"
        for message in history[-14:]
    )

    base_prompt = f"""You are Veyra, a calm and rigorous AI interviewer.

Interview ID: {interview_id}
Candidate name: {candidate_name or "Candidate"}
Target role: {role_title or "Software Engineer"}
Job Description: {job_description or "Not provided"}
Candidate Resume: {resume_text or "Not provided"}

Conversation so far:
{transcript or "No messages yet."}
"""

    if should_wrap:
        prompt = base_prompt + """
Rules:
- THE INTERVIEW MUST END NOW.
- Do NOT ask any more questions.
- Provide a concise hiring-style summary of the interview as your reply.
- You MUST set "finished": true in the JSON response.
- Provide a final score from 1-100.

Return ONLY a valid JSON object with this exact shape:
{
  "reply": "<wrap-up summary>",
  "stage": "wrapup",
  "feedback": "<final feedback>",
  "score": <number 1-100>,
  "finished": true
}"""
    else:
        prompt = base_prompt + f"""
Rules:
- Ask exactly one interview question at a time.
- Keep questions practical, role-specific, and tailored to the candidate's resume and the job description.
- If the candidate already answered, briefly acknowledge the answer before the next question.
- Ask follow-up questions and cross-questions to challenge the candidate's assumptions and evaluate their depth of knowledge.
- The interview is capped at 4 questions. You will be told when to wrap up.
- Be professional, supportive, and direct.

Return ONLY a valid JSON object with this exact shape:
{{
  "reply": "<what the interviewer says next>",
  "stage": "<intro|question|followup>",
  "feedback": "<one short private note about the latest answer, or empty string>",
  "score": null,
  "finished": false
}}"""

    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model=MODEL_NAME,
            response_format={"type": "json_object"},
        )

        raw = chat_completion.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        result = json.loads(raw)

        score = result.get("score")
        if score is not None:
            score = max(1, min(100, int(score)))

        finished = bool(result.get("finished", False))

        # Force end the interview if the question limit has been reached,
        # even if the LLM ignores the wrap-up instruction
        if should_wrap:
            finished = True
            if score is None:
                score = 50  # default score if LLM didn't provide one

        return {
            "reply": result.get("reply", ""),
            "stage": "wrapup" if finished else result.get("stage", "question"),
            "feedback": result.get("feedback", ""),
            "score": score,
            "finished": finished,
        }
    except Exception as e:
        fallback_reply = (
            "I could not reach the interview model right now. "
            "Please try sending your answer again in a moment."
        )
        if not history:
            fallback_reply = (
                f"Welcome to your {role_title or 'software'} interview. "
                "To begin, tell me about a project you are proud of and the impact it had."
            )

        return {
            "reply": fallback_reply,
            "stage": "question",
            "feedback": f"Interview model failed: {str(e)}",
            "score": None,
            "finished": False,
        }

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
