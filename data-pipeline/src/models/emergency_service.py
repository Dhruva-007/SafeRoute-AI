"""
Emergency Service data model.

Represents validated emergency facilities with confidence scoring
and rich metadata for production-grade accuracy.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


class ServiceType(str, Enum):
    """Emergency service types — strict categorization."""
    HOSPITAL = "hospital"
    CLINIC = "clinic"
    POLICE = "police"
    FIRE_STATION = "fire_station"
    AMBULANCE = "ambulance"
    PHARMACY_24H = "pharmacy_24h"
    SHELTER = "shelter"
    HELIPAD = "helipad"


class ServicePriority(int, Enum):
    """Priority for display ordering."""
    CRITICAL = 1   # Life-threatening (hospitals with ER, police, fire)
    HIGH = 2       # Important (24h pharmacies, ambulances)
    MEDIUM = 3     # Useful (clinics, shelters)


class ConfidenceLevel(int, Enum):
    """Data confidence based on validation."""
    VERIFIED = 4      # Has name, address, phone, multiple corroborating tags
    HIGH = 3          # Has name and at least 2 supporting attributes
    MEDIUM = 2        # Has name and basic location
    LOW = 1           # Bare minimum data — DON'T DISPLAY by default


class EmergencyService(BaseModel):
    """
    A validated emergency service location.
    
    Every field is designed to support accurate emergency response.
    """
    
    # ─── Identification ───
    service_uuid: str = Field(default_factory=lambda: str(uuid4()))
    osm_id: str = Field(..., description="e.g., 'node/12345' or 'way/67890'")
    osm_type: str = Field(..., description="node | way | relation")
    
    # ─── Core Information (REQUIRED) ───
    name: str = Field(..., min_length=2, max_length=200)
    service_type: ServiceType
    priority: ServicePriority
    
    # ─── Location (REQUIRED) ───
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    
    # ─── Contact Information ───
    phone: Optional[str] = Field(default=None, max_length=50)
    phone_emergency: Optional[str] = Field(default=None, max_length=50)
    website: Optional[str] = Field(default=None, max_length=500)
    email: Optional[str] = Field(default=None, max_length=200)
    
    # ─── Address ───
    address_full: Optional[str] = Field(default=None, max_length=500)
    address_street: Optional[str] = Field(default=None, max_length=200)
    address_housenumber: Optional[str] = Field(default=None, max_length=50)
    address_city: Optional[str] = Field(default=None, max_length=100)
    address_postcode: Optional[str] = Field(default=None, max_length=20)
    address_state: Optional[str] = Field(default=None, max_length=100)
    
    # ─── Operating Hours ───
    opening_hours: Optional[str] = Field(default=None, max_length=300)
    is_24_7: bool = Field(default=False)
    
    # ─── Service Capabilities ───
    has_emergency: bool = Field(default=False, description="Has ER/emergency dept")
    speciality: Optional[str] = Field(default=None, max_length=200)
    operator: Optional[str] = Field(default=None, max_length=200)
    operator_type: Optional[str] = Field(default=None, max_length=50)
    
    # ─── Accessibility ───
    wheelchair: Optional[str] = Field(default=None)
    
    # ─── Capacity ───
    beds: Optional[int] = Field(default=None, ge=0)
    
    # ─── Quality Assurance ───
    confidence_level: ConfidenceLevel
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    validation_flags: List[str] = Field(default_factory=list)
    
    # ─── Metadata ───
    city_code: str = Field(..., max_length=10)
    data_source: str = Field(default="osm")
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    is_active: bool = Field(default=True)
    
    # ─── Validators ───
    
    @field_validator("phone", "phone_emergency")
    @classmethod
    def normalize_phone(cls, v):
        """Normalize phone numbers."""
        if not v:
            return v
        # Strip spaces, dashes, parens
        cleaned = v.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        return cleaned[:50] if cleaned else None
    
    @field_validator("name")
    @classmethod
    def clean_name(cls, v):
        """Clean and validate the name."""
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name too short")
        return v