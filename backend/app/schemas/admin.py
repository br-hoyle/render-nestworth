import uuid

from pydantic import BaseModel


class CreateInviteRequest(BaseModel):
    household_name: str
    username: str


class InviteResponse(BaseModel):
    household_id: uuid.UUID
    household_name: str
    username: str
    status: str


class InviteListItem(BaseModel):
    household_id: uuid.UUID
    household_name: str
    username: str
    status: str
