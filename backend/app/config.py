from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/omr_db",
)
SECRET_KEY: str = os.getenv("SECRET_KEY", "gelistirme-icin-gecici-anahtar-degistir")
ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
