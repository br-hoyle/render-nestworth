from datetime import date

from pydantic import BaseModel, field_validator

SECURITY_QUESTIONS = [
    "What was your first pet's name?",
    "What city were you born in?",
    "What was the make of your first car?",
    "What is your mother's maiden name?",
    "What was the name of your first school?",
]


class LoginRequest(BaseModel):
    username: str
    password: str


class SessionResponse(BaseModel):
    household_name: str
    username: str
    session_expires_at: int
    is_owner: bool
    birthdate: date | None = None


class SetupAccountRequest(BaseModel):
    username: str
    password: str
    confirm_password: str
    security_question: str
    security_answer: str
    birthdate: date | None = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class SignupRequest(BaseModel):
    household_name: str
    username: str
    password: str
    confirm_password: str
    security_question: str
    security_answer: str
    friends_family_code: str
    birthdate: date | None = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ForgotPasswordQuestionRequest(BaseModel):
    username: str


class ForgotPasswordQuestionResponse(BaseModel):
    security_question: str


class ForgotPasswordResetRequest(BaseModel):
    username: str
    security_answer: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ChangeSecurityQuestionRequest(BaseModel):
    current_password: str
    security_question: str
    security_answer: str


class UpdateHouseholdNameRequest(BaseModel):
    household_name: str


class UpdateBirthdateRequest(BaseModel):
    birthdate: date | None = None
