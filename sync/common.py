"""Shared helpers: database connection and Garmin token storage."""
import base64
import io
import os
import tarfile
import tempfile
from pathlib import Path

import psycopg

HERE = Path(__file__).parent
TOKEN_KEY = "garmin_tokens"


def connect():
    url = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set")
    # prepare_threshold=None keeps this safe even through Neon's pooled connection.
    return psycopg.connect(url, autocommit=True, prepare_threshold=None)


def init_schema(conn):
    conn.execute((HERE / "schema.sql").read_text())


def pack_tokens(token_dir: str) -> str:
    """tar.gz + base64 the token directory so it can live in the database."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for p in Path(token_dir).iterdir():
            tar.add(p, arcname=p.name)
    return base64.b64encode(buf.getvalue()).decode()


def unpack_tokens(blob: str, token_dir: str) -> None:
    Path(token_dir).mkdir(parents=True, exist_ok=True)
    data = base64.b64decode(blob)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        tar.extractall(token_dir, filter="data")


def save_tokens(conn, token_dir: str) -> None:
    if not Path(token_dir).exists() or not any(Path(token_dir).iterdir()):
        return
    conn.execute(
        """insert into kv (key, value) values (%s, %s)
           on conflict (key) do update set value = excluded.value, updated_at = now()""",
        (TOKEN_KEY, pack_tokens(token_dir)),
    )


def load_tokens(conn, token_dir: str) -> bool:
    row = conn.execute("select value from kv where key = %s", (TOKEN_KEY,)).fetchone()
    if not row:
        return False
    unpack_tokens(row[0], token_dir)
    return True


def new_token_dir() -> str:
    return os.path.realpath(tempfile.mkdtemp(prefix="garmin_tokens_"))
