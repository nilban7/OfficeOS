from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ==========================================
# Client Contacts
# ==========================================
class ContactBase(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=160, description="Full name of contact person")]
    designation: Annotated[str | None, Field(default=None, max_length=100, description="Job title or role")] = None
    email: Annotated[str | None, Field(default=None, max_length=320, description="Contact email address")] = None
    phone: Annotated[str | None, Field(default=None, max_length=32, description="Contact phone number")] = None
    is_primary: Annotated[bool, Field(default=False, description="Whether this is the primary point of contact")] = False
    notes: Annotated[str | None, Field(default=None, description="Optional notes about contact")] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Contact name cannot be blank")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            return cleaned.lower() if cleaned else None
        return None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: Annotated[str | None, Field(default=None, min_length=1, max_length=160)] = None
    designation: Annotated[str | None, Field(default=None, max_length=100)] = None
    email: Annotated[str | None, Field(default=None, max_length=320)] = None
    phone: Annotated[str | None, Field(default=None, max_length=32)] = None
    is_primary: Annotated[bool | None, Field(default=None)] = None
    notes: Annotated[str | None, Field(default=None)] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                raise ValueError("Contact name cannot be blank")
            return cleaned
        return None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            return cleaned.lower() if cleaned else None
        return None


class ContactResponse(ContactBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    client_id: UUID
    created_at: datetime
    updated_at: datetime


# ==========================================
# Clients
# ==========================================
ClientStatusType = Literal["active", "inactive", "archived"]


class ClientBase(BaseModel):
    client_code: Annotated[str, Field(min_length=1, max_length=32, description="Unique client code (e.g. CLI-001)")]
    name: Annotated[str, Field(min_length=1, max_length=200, description="Company or client name")]
    legal_name: Annotated[str | None, Field(default=None, max_length=255, description="Registered legal entity name")] = None
    client_type: Annotated[str | None, Field(default=None, max_length=50, description="Type or category")] = None
    email: Annotated[str | None, Field(default=None, max_length=320, description="Primary business email")] = None
    phone: Annotated[str | None, Field(default=None, max_length=32, description="Primary phone number")] = None
    website: Annotated[str | None, Field(default=None, max_length=255, description="Website URL")] = None
    address: Annotated[str | None, Field(default=None, description="Street address")] = None
    city: Annotated[str | None, Field(default=None, max_length=100, description="City")] = None
    state: Annotated[str | None, Field(default=None, max_length=100, description="State or province")] = None
    postal_code: Annotated[str | None, Field(default=None, max_length=32, description="Postal / ZIP code")] = None
    country: Annotated[str | None, Field(default=None, max_length=100, description="Country")] = None
    tax_id: Annotated[str | None, Field(default=None, max_length=64, description="Tax or GST identifier")] = None
    status: Annotated[ClientStatusType, Field(default="active", description="Client status")] = "active"
    notes: Annotated[str | None, Field(default=None, description="Internal notes")] = None

    @field_validator("client_code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if not cleaned:
            raise ValueError("Client code cannot be empty")
        return cleaned

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Client name cannot be blank")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            return cleaned.lower() if cleaned else None
        return None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    client_code: Annotated[str | None, Field(default=None, min_length=1, max_length=32)] = None
    name: Annotated[str | None, Field(default=None, min_length=1, max_length=200)] = None
    legal_name: Annotated[str | None, Field(default=None, max_length=255)] = None
    client_type: Annotated[str | None, Field(default=None, max_length=50)] = None
    email: Annotated[str | None, Field(default=None, max_length=320)] = None
    phone: Annotated[str | None, Field(default=None, max_length=32)] = None
    website: Annotated[str | None, Field(default=None, max_length=255)] = None
    address: Annotated[str | None, Field(default=None)] = None
    city: Annotated[str | None, Field(default=None, max_length=100)] = None
    state: Annotated[str | None, Field(default=None, max_length=100)] = None
    postal_code: Annotated[str | None, Field(default=None, max_length=32)] = None
    country: Annotated[str | None, Field(default=None, max_length=100)] = None
    tax_id: Annotated[str | None, Field(default=None, max_length=64)] = None
    status: Annotated[ClientStatusType | None, Field(default=None)] = None
    notes: Annotated[str | None, Field(default=None)] = None

    @field_validator("client_code")
    @classmethod
    def normalize_code(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip().upper()
            if not cleaned:
                raise ValueError("Client code cannot be empty")
            return cleaned
        return None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                raise ValueError("Client name cannot be blank")
            return cleaned
        return None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            return cleaned.lower() if cleaned else None
        return None


class ClientResponse(ClientBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime
    primary_contact: ContactResponse | None = None
    contacts_count: int = 0


class ClientDetailResponse(ClientResponse):
    contacts: list[ContactResponse] = []
