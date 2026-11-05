"""WebSocket connection management and single-use connection ticket service for Client Engagement Chat.

Supports independent conversation rooms for Client Chat and Team Chat.
"""

from __future__ import annotations

import logging
import secrets
import threading
import time
import uuid
from typing import Any

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

logger = logging.getLogger("officeos.chat_ws")


def _norm_uuid(val: uuid.UUID | str) -> uuid.UUID:
    """Normalize a UUID or string UUID to a standard uuid.UUID instance."""
    if isinstance(val, uuid.UUID):
        return val
    return uuid.UUID(str(val))


class ChatTicket:
    """Represents a single-use connection ticket for WebSocket authentication."""

    def __init__(
        self,
        ticket: str,
        user_id: str,
        org_id: uuid.UUID,
        engagement_id: uuid.UUID,
        profile_id: uuid.UUID | None,
        user_name: str,
        user_role: str,
        is_internal: bool,
        conversation: str = "client",
        ttl_seconds: int = 60,
    ) -> None:
        self.ticket = ticket
        self.user_id = user_id
        self.org_id = org_id
        self.engagement_id = engagement_id
        self.profile_id = profile_id
        self.user_name = user_name
        self.user_role = user_role
        self.is_internal = is_internal
        self.conversation = "internal" if conversation == "internal" else "client"
        self.expires_at = time.time() + ttl_seconds

    @property
    def is_expired(self) -> bool:
        return time.time() > self.expires_at


class ChatTicketStore:
    """Thread-safe, single-use ticket store with automatic expiration cleanup."""

    def __init__(self) -> None:
        self._tickets: dict[str, ChatTicket] = {}
        self._lock = threading.Lock()

    async def issue_ticket(
        self,
        user_id: str,
        org_id: uuid.UUID | str,
        engagement_id: uuid.UUID | str,
        profile_id: uuid.UUID | str | None,
        user_name: str,
        user_role: str,
        is_internal: bool = True,
        conversation: str = "client",
        ttl_seconds: int = 60,
    ) -> str:
        with self._lock:
            # Purge expired tickets periodically
            now = time.time()
            expired = [t for t, obj in self._tickets.items() if obj.expires_at < now]
            for t in expired:
                self._tickets.pop(t, None)

            ticket_str = secrets.token_urlsafe(32)
            norm_conv = "internal" if conversation == "internal" else "client"
            self._tickets[ticket_str] = ChatTicket(
                ticket=ticket_str,
                user_id=str(user_id),
                org_id=_norm_uuid(org_id),
                engagement_id=_norm_uuid(engagement_id),
                profile_id=_norm_uuid(profile_id) if profile_id else None,
                user_name=user_name,
                user_role=user_role,
                is_internal=is_internal,
                conversation=norm_conv,
                ttl_seconds=ttl_seconds,
            )
            logger.info(
                "Issued single-use WebSocket ticket for user %s (%s) on engagement %s [%s]",
                user_name,
                user_id,
                engagement_id,
                norm_conv,
            )
            return ticket_str

    async def redeem_ticket(self, ticket_str: str, engagement_id: uuid.UUID | str) -> ChatTicket | None:
        with self._lock:
            ticket = self._tickets.pop(ticket_str, None)
            if not ticket:
                logger.warning("Ticket redemption failed: ticket not found")
                return None
            if ticket.is_expired:
                logger.warning("Ticket redemption failed: ticket expired")
                return None
            if ticket.engagement_id != _norm_uuid(engagement_id):
                logger.warning(
                    "Ticket redemption failed: engagement mismatch (ticket=%s, requested=%s)",
                    ticket.engagement_id,
                    engagement_id,
                )
                return None
            logger.info(
                "Successfully redeemed ticket for user %s on engagement %s [%s]",
                ticket.user_name,
                ticket.engagement_id,
                ticket.conversation,
            )
            return ticket


class EngagementConnectionManager:
    """Manages active WebSocket connections grouped by (engagement_id, conversation_type).

    Supports independent conversation rooms for Client Chat and Team Chat:
    - (engagement_id, "client"): Project team members + client contacts
    - (engagement_id, "internal"): Company team members ONLY (client contacts strictly excluded)

    Enforces backend participant metadata tracking, JSON serialization safety,
    and automatic dead connection cleanup.
    """

    def __init__(self) -> None:
        # (engagement_id, conversation) -> set of active WebSockets
        self._rooms: dict[tuple[uuid.UUID, str], set[WebSocket]] = {}
        # websocket -> metadata dict
        self._socket_meta: dict[WebSocket, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def _norm_room_key(
        self,
        engagement_id: uuid.UUID | str,
        conversation: str | None = "client",
    ) -> tuple[uuid.UUID, str]:
        norm_id = _norm_uuid(engagement_id)
        norm_conv = "internal" if conversation == "internal" else "client"
        return (norm_id, norm_conv)

    async def connect(
        self,
        engagement_id: uuid.UUID | str,
        websocket: WebSocket,
        ticket: ChatTicket,
        conversation: str | None = None,
    ) -> None:
        norm_conv = "internal" if (conversation or ticket.conversation) == "internal" else "client"
        room_key = self._norm_room_key(engagement_id, norm_conv)

        await websocket.accept()
        with self._lock:
            if room_key not in self._rooms:
                self._rooms[room_key] = set()
            self._rooms[room_key].add(websocket)
            self._socket_meta[websocket] = {
                "engagement_id": room_key[0],
                "conversation": room_key[1],
                "user_id": ticket.user_id,
                "org_id": ticket.org_id,
                "profile_id": ticket.profile_id,
                "user_name": ticket.user_name,
                "user_role": ticket.user_role,
                "is_internal": ticket.is_internal,
                "connected_at": time.time(),
            }
            active_count = len(self._rooms[room_key])

        logger.info(
            "WebSocket connected to engagement room %s [%s] for user %s (is_internal=%s). Active: %d",
            room_key[0],
            room_key[1],
            ticket.user_name,
            ticket.is_internal,
            active_count,
        )

    async def disconnect(
        self,
        engagement_id: uuid.UUID | str,
        websocket: WebSocket,
        conversation: str | None = None,
    ) -> None:
        norm_id = _norm_uuid(engagement_id)
        with self._lock:
            meta = self._socket_meta.pop(websocket, {})
            norm_conv = conversation or meta.get("conversation", "client")
            room_key = self._norm_room_key(norm_id, norm_conv)

            if room_key in self._rooms:
                self._rooms[room_key].discard(websocket)
                if not self._rooms[room_key]:
                    self._rooms.pop(room_key, None)
            active_count = len(self._rooms.get(room_key, set()))

        logger.info(
            "WebSocket disconnected from engagement room %s [%s] for user %s. Remaining: %d",
            room_key[0],
            room_key[1],
            meta.get("user_name", "Unknown"),
            active_count,
        )

    async def broadcast_message(
        self,
        engagement_id: uuid.UUID | str,
        message_data: dict[str, Any],
        conversation: str | None = None,
        visibility: str | None = None,
    ) -> int:
        """Broadcast a message strictly to the specified conversation room (client or internal).

        Serializes UUIDs, datetimes, and complex types to JSON-safe primitives using jsonable_encoder.
        """
        raw_conv = conversation or visibility or message_data.get("visibility") or message_data.get("conversation") or "client"
        norm_conv = "internal" if raw_conv == "internal" else "client"
        room_key = self._norm_room_key(engagement_id, norm_conv)

        with self._lock:
            sockets = list(self._rooms.get(room_key, []))
            recipients = [
                (ws, self._socket_meta.get(ws, {}))
                for ws in sockets
            ]

        if not recipients:
            logger.info("No active WebSocket recipients in room %s [%s]", room_key[0], room_key[1])
            return 0

        # Encode all UUID, datetime, and decimal types into JSON primitives
        serializable_data = jsonable_encoder(message_data)
        payload = {
            "type": "chat_message",
            "data": serializable_data,
        }

        msg_id = serializable_data.get("id")
        logger.info(
            "Broadcasting message %s to %d candidates in room %s [%s]",
            msg_id,
            len(recipients),
            room_key[0],
            room_key[1],
        )

        dead_sockets: list[WebSocket] = []
        delivered_count = 0
        for ws, meta in recipients:
            # Secondary security gate: internal rooms never deliver to non-internal connections
            if room_key[1] == "internal" and not meta.get("is_internal", False):
                continue

            try:
                await ws.send_json(payload)
                delivered_count += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to deliver WebSocket message to %s: %s", ws, exc)
                dead_sockets.append(ws)

        logger.info(
            "Delivered WebSocket message %s to %d/%d participants in room %s [%s]",
            msg_id,
            delivered_count,
            len(recipients),
            room_key[0],
            room_key[1],
        )

        for ws in dead_sockets:
            await self.disconnect(room_key[0], ws, conversation=room_key[1])

        return delivered_count

    async def ping_all(self, engagement_id: uuid.UUID | str, conversation: str | None = None) -> None:
        norm_id = _norm_uuid(engagement_id)
        with self._lock:
            if conversation:
                keys = [self._norm_room_key(norm_id, conversation)]
            else:
                keys = [self._norm_room_key(norm_id, "client"), self._norm_room_key(norm_id, "internal")]
            sockets: list[tuple[tuple[uuid.UUID, str], WebSocket]] = []
            for k in keys:
                for ws in self._rooms.get(k, []):
                    sockets.append((k, ws))

        dead_sockets: list[tuple[tuple[uuid.UUID, str], WebSocket]] = []
        for rk, ws in sockets:
            try:
                await ws.send_json({"type": "pong", "time": time.time()})
            except Exception:  # noqa: BLE001
                dead_sockets.append((rk, ws))

        for rk, ws in dead_sockets:
            await self.disconnect(rk[0], ws, conversation=rk[1])

    async def send_pong(self, websocket: WebSocket) -> None:
        """Reply to heartbeat ping frame."""
        try:
            await websocket.send_json({"type": "pong", "timestamp": int(time.time() * 1000)})
        except Exception as exc:  # noqa: BLE001
            logger.debug("Failed to send pong: %s", exc)

    def get_socket_meta(self, websocket: WebSocket) -> dict[str, Any] | None:
        with self._lock:
            return self._socket_meta.get(websocket)

    def get_active_count(self, engagement_id: uuid.UUID | str, conversation: str | None = None) -> int:
        norm_id = _norm_uuid(engagement_id)
        with self._lock:
            if conversation:
                room_key = self._norm_room_key(norm_id, conversation)
                return len(self._rooms.get(room_key, set()))
            # Total across both conversation rooms for this engagement
            client_key = self._norm_room_key(norm_id, "client")
            internal_key = self._norm_room_key(norm_id, "internal")
            return len(self._rooms.get(client_key, set())) + len(self._rooms.get(internal_key, set()))


# Global singletons
chat_ticket_store = ChatTicketStore()
chat_connection_manager = EngagementConnectionManager()
