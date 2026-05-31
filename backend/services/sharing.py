"""
Trip sharing service.
Generates secure share tokens with configurable expiry.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

from models.trip_storage import SavedTrip, get_trip_store

logger = logging.getLogger(__name__)


# Valid expiry options
ExpiryOption = Literal["1d", "7d", "30d", "never"]

EXPIRY_DAYS = {
    "1d": 1,
    "7d": 7,
    "30d": 30,
    "never": None,
}


class SharingService:
    """Handles share token creation, validation, and revocation."""

    def __init__(self) -> None:
        self._store = get_trip_store()
        logger.info("SharingService initialised")

    def create_share(
        self,
        trip_id: str,
        expiry: ExpiryOption = "7d",
    ) -> SavedTrip:
        """
        Create or refresh a share token for a trip.

        Args:
            trip_id: ID of the trip to share
            expiry:  '1d' | '7d' | '30d' | 'never'

        Returns:
            Updated SavedTrip with share token and expiry set.
        """
        trip = self._store.get(trip_id)
        if trip is None:
            raise LookupError(f"Trip {trip_id} not found")

        if expiry not in EXPIRY_DAYS:
            raise ValueError(
                f"Invalid expiry '{expiry}'. "
                f"Must be one of: {list(EXPIRY_DAYS.keys())}"
            )

        # Generate cryptographically secure token (32 chars, URL-safe)
        token = secrets.token_urlsafe(24)
        now = datetime.now(timezone.utc)

        trip.share_token = token
        trip.share_created_at = now.isoformat()

        days = EXPIRY_DAYS[expiry]
        if days is None:
            trip.share_expires_at = None  # permanent
        else:
            expires = now + timedelta(days=days)
            trip.share_expires_at = expires.isoformat()

        logger.info(
            "Share created | trip_id=%s | expiry=%s | token=%s...",
            trip_id, expiry, token[:8],
        )

        return self._store.save(trip)

    def revoke_share(self, trip_id: str) -> SavedTrip:
        """Disable sharing for a trip."""
        trip = self._store.revoke_share(trip_id)
        if trip is None:
            raise LookupError(f"Trip {trip_id} not found")
        logger.info("Share revoked | trip_id=%s", trip_id)
        return trip

    def get_shared_trip(self, token: str) -> SavedTrip | None:
        """
        Resolve a share token to a trip.
        Returns None if not found or expired.
        """
        return self._store.find_by_share_token(token)


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_sharing_service: SharingService | None = None


def get_sharing_service() -> SharingService:
    global _sharing_service
    if _sharing_service is None:
        _sharing_service = SharingService()
    return _sharing_service