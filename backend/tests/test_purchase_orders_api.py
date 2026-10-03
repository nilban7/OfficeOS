import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.models.identity import Profile
from app.models.procurement import PurchaseOrder, PurchaseOrderItem, Vendor
from tests.auth_helpers import create_test_token

ALL_PERMISSIONS = [
    "procurement.view",
    "procurement.create",
    "procurement.update",
    "procurement.delete",
    "procurement.approve",
    "purchase_orders.view",
    "purchase_orders.manage",
    "vendors.view",
    "vendors.manage",
]


@pytest.fixture
def auth_context():
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    token = create_test_token(user_id=user_id)
    profile_id = uuid.uuid4()
    profile = Profile(
        id=profile_id,
        auth_user_id=uuid.UUID(user_id),
        email="buyer@example.com",
        first_name="Jane",
        last_name="Buyer",
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Organization-Id": org_id,
    }
    return {
        "user_id": user_id,
        "org_id": org_id,
        "profile_id": profile_id,
        "profile": profile,
        "token": token,
        "headers": headers,
    }


def _create_mock_vendor(
    org_id: uuid.UUID, vendor_id: uuid.UUID | None = None, code: str = "VND-001"
) -> Vendor:
    return Vendor(
        id=vendor_id or uuid.uuid4(),
        organization_id=org_id,
        vendor_code=code,
        name="Dell Technologies",
        contact_person="Sales Rep",
        email="sales@dell.com",
        phone="+1-800-DELL",
        address="1 Dell Way, Round Rock, TX",
        tax_id="US-12345678",
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


def _create_mock_po(
    org_id: uuid.UUID,
    vendor: Vendor,
    po_id: uuid.UUID | None = None,
    status: str = "draft",
    po_number: str = "PO-202609-0001",
) -> PurchaseOrder:
    po_uuid = po_id or uuid.uuid4()
    item1 = PurchaseOrderItem(
        id=uuid.uuid4(),
        organization_id=org_id,
        purchase_order_id=po_uuid,
        item_description="Dell PowerEdge R750 Server",
        quantity=Decimal(2),
        unit="units",
        unit_price=Decimal("2500.00"),
        tax_rate=Decimal("10.00"),
        tax_amount=Decimal("500.00"),
        line_total=Decimal("5500.00"),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    po = PurchaseOrder(
        id=po_uuid,
        organization_id=org_id,
        po_number=po_number,
        vendor_id=vendor.id,
        purchase_request_id=None,
        order_date=date(2026, 9, 29),
        expected_delivery_date=date(2026, 10, 15),
        status=status,
        subtotal=Decimal("5000.00"),
        tax_amount=Decimal("500.00"),
        total_amount=Decimal("5500.00"),
        currency="USD",
        notes="Urgent data center deployment",
        created_by_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    po.vendor = vendor
    po.purchase_request = None
    po.created_by = None
    po.items = [item1]
    return po


@pytest.mark.asyncio
async def test_list_purchase_orders(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    vendor = _create_mock_vendor(org_id)
    po1 = _create_mock_po(org_id, vendor, status="draft", po_number="PO-202609-0001")
    po2 = _create_mock_po(org_id, vendor, status="issued", po_number="PO-202609-0002")

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    count_res = MagicMock()
    count_res.scalar.return_value = 2

    list_res = MagicMock()
    list_res.scalars.return_value.all.return_value = [po1, po2]

    mock_session.execute.side_effect = [count_res, list_res]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/purchase-orders", headers=auth_context["headers"])
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["items"]) == 2
        assert data["data"]["items"][0]["po_number"] == "PO-202609-0001"
        assert data["data"]["items"][0]["vendor_name"] == "Dell Technologies"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_purchase_order_with_line_items(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    vendor = _create_mock_vendor(org_id)

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.flush = AsyncMock()
    mock_session.add = MagicMock()

    # Vendor validation query returns vendor
    vendor_res = MagicMock()
    vendor_res.scalar_one_or_none.return_value = vendor

    # PO number generation query returns None
    po_num_res = MagicMock()
    po_num_res.scalar_one_or_none.return_value = None

    # Fetch created PO
    created_po = _create_mock_po(org_id, vendor)
    fetch_res = MagicMock()
    fetch_res.scalar_one_or_none.return_value = created_po

    mock_session.execute.side_effect = [vendor_res, po_num_res, fetch_res]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "vendor_id": str(vendor.id),
        "order_date": "2026-09-29",
        "expected_delivery_date": "2026-10-15",
        "currency": "USD",
        "notes": "Urgent data center deployment",
        "items": [
            {
                "item_description": "Dell PowerEdge R750 Server",
                "quantity": 2,
                "unit": "units",
                "unit_price": 2500.00,
                "tax_rate": 10.00,
            }
        ],
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/purchase-orders",
                json=payload,
                headers=auth_context["headers"],
            )
        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["data"]["po_number"] == "PO-202609-0001"
        assert len(data["data"]["items"]) == 1
        assert data["data"]["total_amount"] == "5500.00"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_create_purchase_order_fails_with_invalid_vendor(auth_context):
    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    # Vendor lookup returns None (foreign key failure / cross-tenant attempt)
    vendor_res = MagicMock()
    vendor_res.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = vendor_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    payload = {
        "vendor_id": str(uuid.uuid4()),
        "order_date": "2026-09-29",
        "items": [
            {
                "item_description": "Test Goods",
                "quantity": 1,
                "unit_price": 100.00,
            }
        ],
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/purchase-orders",
                json=payload,
                headers=auth_context["headers"],
            )
        assert response.status_code == 400
        assert "Vendor not found" in response.json()["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_get_purchase_order_detail(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    vendor = _create_mock_vendor(org_id)
    po = _create_mock_po(org_id, vendor)

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    fetch_res = MagicMock()
    fetch_res.scalar_one_or_none.return_value = po
    mock_session.execute.return_value = fetch_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get(
                f"/api/v1/purchase-orders/{po.id}", headers=auth_context["headers"]
            )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["id"] == str(po.id)
        assert len(data["data"]["items"]) == 1
        assert data["data"]["items"][0]["item_description"] == "Dell PowerEdge R750 Server"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_cancel_purchase_order_success(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    vendor = _create_mock_vendor(org_id)
    po = _create_mock_po(org_id, vendor, status="draft")

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS
    mock_session.flush = AsyncMock()

    lookup_res = MagicMock()
    lookup_res.scalar_one_or_none.return_value = po

    fetch_res = MagicMock()
    fetch_res.scalar_one_or_none.return_value = po

    mock_session.execute.side_effect = [lookup_res, fetch_res]

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                f"/api/v1/purchase-orders/{po.id}/cancel",
                headers=auth_context["headers"],
            )
        assert response.status_code == 200
        assert po.status == "cancelled"
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)


@pytest.mark.asyncio
async def test_close_purchase_order_fails_on_draft(auth_context):
    org_id = uuid.UUID(auth_context["org_id"])
    vendor = _create_mock_vendor(org_id)
    po = _create_mock_po(org_id, vendor, status="draft")

    mock_session = AsyncMock()
    mock_session.scalars.return_value = ALL_PERMISSIONS

    lookup_res = MagicMock()
    lookup_res.scalar_one_or_none.return_value = po
    mock_session.execute.return_value = lookup_res

    app.dependency_overrides[get_tenant_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                f"/api/v1/purchase-orders/{po.id}/close",
                headers=auth_context["headers"],
            )
        assert response.status_code == 400
        assert (
            "Cannot close a purchase order in status 'draft'" in response.json()["error"]["message"]
        )
    finally:
        app.dependency_overrides.pop(get_tenant_session, None)
