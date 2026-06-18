# Veyra — AI-Powered Resume Matcher & Interviewer

Veyra is an intelligent hiring platform that automates resume screening and candidate interviews using AI. Recruiters upload resumes against a job description, and the system scores, ranks, and interviews candidates — all powered by LLMs and real-time voice transcription.

---

## Features

- **Resume Scoring** — Upload multiple PDF resumes and get AI-scored rankings (1–10) against a job description.
- **AI Interviews** — Candidates receive a unique interview link where an AI interviewer (Veyra) conducts a structured, voice-based interview with up to 4 questions.
- **Voice Transcription** — Real-time speech-to-text via Deepgram, with a visual audio orb and auto-submit on silence detection.
- **Interview Enforcement** — Each interview link is one-time use with a 24-hour expiry. Completed interviews cannot be retaken.
- **Email Extraction** — Automatically extracts candidate email addresses from resumes during scoring.
- **Candidate Leaderboard** — View and rank candidates by resume score and interview score.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Backend** | Python, FastAPI, Uvicorn |
| **LLM** | Groq API (Qwen / Llama models) |
| **Speech-to-Text** | Deepgram (Nova-2, real-time WebSocket) |
| **Database** | Supabase (PostgreSQL) |
| **Email** | Nodemailer |

---

## Project Structure

```
Veyra/
├── backend/
│   ├── config.py            # Centralized environment config
│   ├── main.py              # FastAPI app — REST + WebSocket endpoints
│   ├── llm_scoring.py       # LLM logic for resume scoring & interviews
│   ├── pdf_analysier.py     # PDF text extraction & Supabase operations
│   ├── generate_pdfs.py     # Utility to generate test PDFs
│   ├── requirements.txt     # Python dependencies
│   └── .env                 # Environment variables (not committed)
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx                 # Home page
│   │   ├── upload/page.tsx          # Resume upload & scoring page
│   │   ├── interview/[id]/page.tsx  # AI interview page (voice + text)
│   │   ├── interview/[id]/terms.tsx # Terms acceptance screen
│   │   └── api/send-emails/         # Email API route
│   ├── package.json
│   └── .env                         # Frontend env vars (not committed)
│
└── PDFs/                    # Sample/test PDF resumes
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- API keys for: [Groq](https://console.groq.com/), [Deepgram](https://deepgram.com/), [Supabase](https://supabase.com/)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/Veyra.git
cd Veyra
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
GROQ_KEY=your_groq_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
MAIL=your_email@example.com
APP_PASSWORD=your_email_app_password
```

Start the backend:

```bash
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`.

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Create a `.env` file in `frontend/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start the frontend:

```bash
npm run dev
```

The app runs at `http://localhost:3000`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/api/upload` | Upload PDFs + job description for scoring |
| `GET` | `/api/candidates/{job_id}` | Get ranked candidates for a job |
| `GET` | `/api/interview/{id}/verify` | Verify interview link validity |
| `POST` | `/api/interview/{id}/message` | Send/receive interview messages |
| `WS` | `/ws/transcribe/{id}` | Real-time audio transcription proxy |

---

## Configuration

All backend settings are managed in `backend/config.py`:

| Variable | Default | Description |
|----------|---------|-------------|
| `GROQ_KEY` | — | Groq API key |
| `SUPABASE_URL` | — | Supabase project URL |
| `SUPABASE_KEY` | — | Supabase anon/service key |
| `DEEPGRAM_API_KEY` | — | Deepgram API key |
| `GROQ_MODEL` | `qwen/qwen3-32b` | LLM model for scoring & interviews |
| `DEEPGRAM_MODEL` | `nova-2` | Deepgram STT model |

Override any default by adding the variable to your `.env` file.

---

## Interview Flow

1. **Recruiter uploads resumes** → PDFs are scored and candidates are saved to Supabase.
2. **Recruiter sends interview link** → Candidate receives a unique URL (`/interview/{id}`).
3. **Candidate opens link** → Verification checks: valid ID, not expired (24h), not already completed.
4. **Candidate accepts terms** → Microphone permission is requested.
5. **AI interview begins** → Veyra asks up to 4 role-specific questions via voice + text.
6. **Interview ends** → Final score (1–100) is saved. The link is marked as completed and cannot be reused.

---

## License

This project is for personal/educational use.
