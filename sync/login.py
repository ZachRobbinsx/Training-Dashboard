"""ONE-TIME setup: log in to Garmin from your own computer and save the session
token into the database. After this, the scheduled sync never needs your password.

Usage (from the sync/ folder, with DATABASE_URL exported):
    python login.py

Re-run this if the scheduled sync ever reports that it can't log in.
"""
import getpass
import sys

from garminconnect import Garmin

import common


def main():
    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password (hidden): ")

    token_dir = common.new_token_dir()
    client = Garmin(email, password, prompt_mfa=lambda: input("MFA code: ").strip())
    client.login(token_dir)  # logs in with credentials and writes tokens into token_dir
    print("Logged in to Garmin OK.")

    conn = common.connect()
    common.init_schema(conn)
    common.save_tokens(conn, token_dir)
    print("Token saved to the database. You can now run sync.py.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(f"Login failed: {e}", file=sys.stderr)
        sys.exit(1)
