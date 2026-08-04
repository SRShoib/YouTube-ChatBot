import time
from typing import Callable, Dict, Tuple

from fastapi import HTTPException, Request

# One person = one IP address, since there's no login. Fixed-window limiter:
# each IP gets a fresh allowance every hour.
_WINDOW_SECONDS = 3600


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _make_rate_limiter(max_requests: int, action: str) -> Callable[[Request], None]:
    # ip -> (window_start_time, requests_made_in_window). Separate dict per
    # limiter, so asking questions and loading transcripts don't share a budget.
    request_log: Dict[str, Tuple[float, int]] = {}

    def limiter(request: Request) -> None:
        ip = _client_ip(request)
        now = time.time()
        window_start, count = request_log.get(ip, (now, 0))

        if now - window_start >= _WINDOW_SECONDS:
            window_start, count = now, 0

        count += 1
        request_log[ip] = (window_start, count)

        if count > max_requests:
            retry_after = max(int(_WINDOW_SECONDS - (now - window_start)), 1)
            raise HTTPException(
                status_code=429,
                detail=f"Too many {action} from this network. Try again in about {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

    return limiter


rate_limit_questions = _make_rate_limiter(max_requests=20, action="questions")
rate_limit_indexing = _make_rate_limiter(max_requests=10, action="transcript loads")
