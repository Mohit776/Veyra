import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    """Central configuration class for backend environment variables."""
    GROQ_KEY: str = os.environ.get("GROQ_KEY", "")
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")
    DEEPGRAM_API_KEY: str = os.environ.get("DEEPGRAM_API_KEY", "")
    
    # Models
    GROQ_MODEL: str = os.environ.get("GROQ_MODEL", "qwen/qwen3-32b")
    DEEPGRAM_MODEL: str = os.environ.get("DEEPGRAM_MODEL", "nova-2")

# Create a global instance to be imported across the backend
config = Config()
