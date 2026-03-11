from pydantic import BaseModel, Field


class AuthUserResponse(BaseModel):
    id: str
    email: str
    full_name: str = ""


class AuthSessionResponse(BaseModel):
    access_token: str
    refresh_token: str = ""
    token_type: str = "bearer"
    expires_in: int = 3600
    user: AuthUserResponse


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=120)


class SignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=120)
    full_name: str = Field(default="", max_length=120)


class TestAccountResponse(BaseModel):
    email: str
    password: str
    full_name: str = ""
