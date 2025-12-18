from pydantic import BaseModel


class SessionRequest(BaseModel):
    year: int = 2025
    round_num: int = 1
    session_type: str = "R"
    refresh: bool = False
