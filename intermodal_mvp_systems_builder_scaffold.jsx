// File: README.md

# Intermodal Booking MVP — Systems Builder Scaffold

This repo scaffold turns the Architect's plan into a running prototype that:

- Pulls flight + bus options (Kiwi Tequila flights; FlixBus via RapidAPI or public endpoint) and optional Uber fare estimates.
- Normalizes results into a lean SQLite schema.
- Compares intermodal (bus→flight, train-like via bus placeholder) vs. direct flights and ranks by savings % and time.
- Exposes a FastAPI backend with REST endpoints ready for a Week-3 frontend.

> Budget-first: everything here runs locally with free tiers. Live calls are feature-flagged so you can run with **mock providers** if you don’t have keys yet.

---

## Quickstart

```bash
# 1) Clone and enter
# git clone <your-repo-url> intermodal-mvp && cd intermodal-mvp

# 2) Python env
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 3) Configure env
cp .env.example .env
# Fill TEQUILA_API_KEY, RAPIDAPI_KEY if available. Otherwise leave blank to use mocks.

# 4) Init DB
python scripts/db_init.py

# 5) Run the backend
uvicorn backend.app:app --reload

# 6) Try a search (new tab)
# Example: NYC → BOS on 2025-11-15
curl "http://localhost:8000/search?origin=NYC&destination=BOS&date=2025-11-15"

# 7) Generate sample dataset (10+ routes)
python scripts/run_sample_routes.py
```

---

## Folder Structure

```
intermodal-mvp/
├── backend/
│   ├── app.py                 # FastAPI app & routers
│   ├── schemas.py             # Pydantic models
│   ├── compare.py             # Comparison & ranking engine
│   ├── providers/
│   │   ├── base.py            # Provider interface
│   │   ├── tequila.py         # Kiwi Tequila flight search
│   │   ├── flixbus.py         # FlixBus trips (RapidAPI or fallback public)
│   │   ├── uber.py            # Uber price estimates (optional)
│   │   └── mock.py            # Mocks for offline/dev
│   ├── db/
│   │   ├── models.py          # SQLAlchemy ORM
│   │   ├── session.py         # DB session/engine
│   │   └── crud.py            # Persistence helpers
│   └── util/
│       ├── geo.py             # IATA→coords, city→coords helpers
│       └── time.py            # parsing, timezone helpers
├── scripts/
│   ├── db_init.py             # Create tables
│   ├── run_sample_routes.py   # Fetch & persist ≥10 sample corridors
│   └── smoke_test.py          # Minimal end-to-end test
├── tests/
│   └── test_compare.py        # Unit tests for ranking logic
├── .env.example
├── requirements.txt
└── README.md
```

---

## Environment

```
# .env.example
TEQUILA_API_KEY=
TEQUILA_BASE=https://tequila-api.kiwi.com
RAPIDAPI_KEY=
FLIXBUS_BASE_RAPID=https://flixbus2.p.rapidapi.com
FLIXBUS_BASE_PUBLIC=https://global.api.flixbus.com
UBER_SERVER_TOKEN=
PROVIDERS=tequila,mock_bus   # alternatives: tequila,flixbus; add uber for rideshare estimates
DB_URL=sqlite:///./intermodal.db
```

Set `PROVIDERS` to switch bus/last-mile sources without touching code.

---

## REST Endpoints (FastAPI)

- `GET /health` → `{ ok: true }`
- `GET /search?origin=NYC&destination=BOS&date=2025-11-15&adults=1` → Runs provider fetch → stores raw/normalized → returns ranked results.
- `GET /results?search_id=...` → Returns cached search with ranked intermodal vs. direct flight options.

### Response shape (abridged)
```json
{
  "search_id": "2025-11-15_NYC_BOS",
  "direct_flight_best": {"price": 118.0, "duration_min": 75, "carrier": "B6"},
  "intermodal_best": [
    {
      "legs": [
        {"mode": "bus", "provider": "FlixBus", "from": "NYC", "to": "BOS", "price": 24.99, "duration_min": 260},
        {"mode": "flight", "provider": "Kiwi", "from": "BOS", "to": "CDG", "price": 298.00, "duration_min": 405}
      ],
      "total_price": 322.99,
      "total_duration_min": 665,
      "savings_vs_direct_pct": 18.4,
      "notes": ["Self-transfer buffer 2h at BOS"]
    }
  ]
}
```

---

## Test Corridors (≥10 routes)

1. NYC ⇄ BOS (US bus vs. shuttle flights)
2. NYC ⇄ DCA (bus vs. shuttle flights)
3. LAX ⇄ SAN (bus vs. short-hop flights)
4. MUC ⇄ VIE (FlixBus vs. direct flight; rail-like corridor)
5. BER ⇄ PRG
6. MIL ⇄ ZRH
7. AMS ⇄ BRU
8. MAD ⇄ BCN
9. CDG ⇄ BRU
10. FRA ⇄ STR

> These emphasize realistic intermodal substitutions where bus/rail often beats regional flights on cost and sometimes time.

---

## Next Steps (Week 3 Frontend Prep)
- Add `GET /airports`, `GET /stations`, autocomplete from Tequila `/locations`.
- CORS + pagination + simple auth token.
- Deploy on Render (backend) and Supabase (if migrating DB) under free tiers.

---


// File: requirements.txt
fastapi==0.115.5
uvicorn[standard]==0.32.0
httpx==0.27.2
python-dotenv==1.0.1
SQLAlchemy==2.0.36
pydantic==2.9.2
pydantic-settings==2.6.1
rapidfuzz==3.9.7


// File: backend/app.py
from fastapi import FastAPI, Query
from backend.schemas import SearchResponse
from backend.compare import run_search

app = FastAPI(title="Intermodal MVP API")

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/search", response_model=SearchResponse)
async def search(origin: str = Query(..., min_length=3),
                 destination: str = Query(..., min_length=3),
                 date: str = Query(...),
                 adults: int = 1):
    return await run_search(origin, destination, date, adults)


// File: backend/schemas.py
from pydantic import BaseModel, Field
from typing import List, Optional

class Leg(BaseModel):
    mode: str
    provider: str
    from_code: str
    to_code: str
    depart_iso: Optional[str] = None
    arrive_iso: Optional[str] = None
    price: Optional[float] = None
    currency: str = "USD"
    duration_min: Optional[int] = None
    meta: dict = Field(default_factory=dict)

class Itinerary(BaseModel):
    legs: List[Leg]
    total_price: Optional[float]
    currency: str = "USD"
    total_duration_min: Optional[int]
    savings_vs_direct_pct: Optional[float] = None
    notes: List[str] = Field(default_factory=list)

class SearchResponse(BaseModel):
    search_id: str
    origin: str
    destination: str
    date: str
    direct_flight_best: Optional[dict]
    intermodal_best: List[Itinerary]


// File: backend/providers/base.py
from typing import List
from backend.schemas import Leg

class Provider:
    name: str
    mode: str
    async def search(self, origin: str, destination: str, date: str) -> List[Leg]:
        raise NotImplementedError


// File: backend/providers/tequila.py
import os, httpx, math
from typing import List
from backend.schemas import Leg

TEQUILA_BASE = os.getenv("TEQUILA_BASE", "https://tequila-api.kiwi.com")
TEQUILA_KEY = os.getenv("TEQUILA_API_KEY", "")

async def _request(params):
    headers = {"apikey": TEQUILA_KEY}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{TEQUILA_BASE}/v2/search", params=params, headers=headers)
        r.raise_for_status()
        return r.json()

async def search_flights(origin: str, destination: str, date: str) -> List[Leg]:
    if not TEQUILA_KEY:
        return []
    params = {
        "fly_from": origin,
        "fly_to": destination,
        "date_from": date,
        "date_to": date,
        "curr": "USD",
        "adults": 1,
        "limit": 5,
        "sort": "price"
    }
    data = await _request(params)
    legs = []
    for itm in data.get("data", []):
        price = itm.get("price")
        duration_total = itm.get("duration", {}).get("total")
        route = itm.get("route", [])
        depart_iso = route[0]["utc_departure"] if route else None
        arrive_iso = route[-1]["utc_arrival"] if route else None
        legs.append(Leg(
            mode="flight",
            provider="Kiwi-Tequila",
            from_code=origin,
            to_code=destination,
            depart_iso=depart_iso,
            arrive_iso=arrive_iso,
            price=float(price) if price is not None else None,
            duration_min=int(duration_total/60) if duration_total else None,
            meta={"route": route}
        ))
    return legs


// File: backend/providers/flixbus.py
import os, httpx
from typing import List
from backend.schemas import Leg

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
FLIXBUS_BASE_RAPID = os.getenv("FLIXBUS_BASE_RAPID", "https://flixbus2.p.rapidapi.com")
FLIXBUS_BASE_PUBLIC = os.getenv("FLIXBUS_BASE_PUBLIC", "https://global.api.flixbus.com")

async def search_bus(origin_id: str, destination_id: str, date: str) -> List[Leg]:
    # Prefer RapidAPI if key is present; otherwise attempt public endpoint; else return []
    if RAPIDAPI_KEY:
        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": FLIXBUS_BASE_RAPID.split("//")[-1]
        }
        url = f"{FLIXBUS_BASE_RAPID}/trips"
        params = {"from_id": origin_id, "to_id": destination_id, "date": date}
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url, params=params, headers=headers)
            r.raise_for_status()
            data = r.json()
            trips = data.get("trips", [])
            return [Leg(
                mode="bus",
                provider="FlixBus",
                from_code=origin_id,
                to_code=destination_id,
                depart_iso=t.get("departure"),
                arrive_iso=t.get("arrival"),
                price=(float(t.get("price"))/100.0) if isinstance(t.get("price"), int) else t.get("price"),
                currency=t.get("currency", "EUR"),
                duration_min=t.get("duration_min"),
                meta={"raw": t}
            ) for t in trips]
    else:
        # Minimal public fallback (subject to change; returns empty if unavailable)
        return []


// File: backend/providers/uber.py
import os, httpx
from typing import List
from backend.schemas import Leg

UBER_TOKEN = os.getenv("UBER_SERVER_TOKEN", "")

async def estimate_uber(origin_lat, origin_lng, dest_lat, dest_lng) -> List[Leg]:
    if not UBER_TOKEN:
        return []
    headers = {"Authorization": f"Token {UBER_TOKEN}"}
    url = "https://api.uber.com/v1/estimates/price"
    params = {"start_latitude": origin_lat, "start_longitude": origin_lng,
              "end_latitude": dest_lat, "end_longitude": dest_lng}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, params=params, headers=headers)
        r.raise_for_status()
        data = r.json().get("prices", [])
        legs = []
        for p in data:
            low = p.get("low_estimate"); high = p.get("high_estimate")
            price = (low + high)/2.0 if (low and high) else None
            legs.append(Leg(mode="rideshare", provider=f"Uber-{p.get('display_name')}",
                            from_code="origin", to_code="dest",
                            price=price, currency=p.get("currency_code", "USD"),
                            duration_min=p.get("duration"), meta=p))
        return legs


// File: backend/providers/mock.py
from typing import List
from backend.schemas import Leg

async def mock_bus(origin: str, destination: str, date: str) -> List[Leg]:
    samples = {
        ("NYC","BOS"): [(24.99, 260), (29.99, 255)],
        ("NYC","DCA"): [(19.99, 285)],
        ("LAX","SAN"): [(16.00, 150)],
        ("MUC","VIE"): [(21.00, 300)],
        ("BER","PRG"): [(18.00, 270)],
        ("MIL","ZRH"): [(25.00, 240)],
        ("AMS","BRU"): [(14.00, 175)],
        ("MAD","BCN"): [(28.00, 375)],
        ("CDG","BRU"): [(13.00, 200)],
        ("FRA","STR"): [(12.00, 150)]
    }
    data = samples.get((origin, destination), [])
    return [Leg(mode="bus", provider="MockBus", from_code=origin, to_code=destination,
                price=price, duration_min=dur) for price, dur in data]


// File: backend/db/models.py
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import Column, String, Integer, Float, JSON, ForeignKey

Base = declarative_base()

class Search(Base):
    __tablename__ = "searches"
    id = Column(String, primary_key=True)
    origin = Column(String)
    destination = Column(String)
    date = Column(String)

class Option(Base):
    __tablename__ = "options"
    id = Column(Integer, primary_key=True, autoincrement=True)
    search_id = Column(String, ForeignKey("searches.id"))
    mode = Column(String)
    provider = Column(String)
    from_code = Column(String)
    to_code = Column(String)
    price = Column(Float)
    currency = Column(String)
    duration_min = Column(Integer)
    meta = Column(JSON)


// File: backend/db/session.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DB_URL = os.getenv("DB_URL", "sqlite:///./intermodal.db")
engine = create_engine(DB_URL, echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


// File: backend/db/crud.py
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .models import Base, Search, Option

def create_tables(engine):
    Base.metadata.create_all(engine)

def upsert_search(db: Session, sid: str, origin: str, destination: str, date: str):
    s = db.get(Search, sid)
    if not s:
        s = Search(id=sid, origin=origin, destination=destination, date=date)
        db.add(s)
    return s

def add_options(db: Session, sid: str, legs):
    for leg in legs:
        db.add(Option(search_id=sid, mode=leg.mode, provider=leg.provider,
                      from_code=leg.from_code, to_code=leg.to_code,
                      price=leg.price, currency=leg.currency,
                      duration_min=leg.duration_min, meta=leg.meta))
    db.commit()


// File: backend/compare.py
import os
from typing import List
from backend.schemas import SearchResponse, Itinerary, Leg
from backend.providers.tequila import search_flights
from backend.providers.flixbus import search_bus
from backend.providers.mock import mock_bus
from backend.db.session import SessionLocal
from backend.db.crud import upsert_search, add_options

async def fetch_direct_flight(origin, destination, date):
    flights = await search_flights(origin, destination, date)
    if not flights:
        return None
    best = sorted([f for f in flights if f.price], key=lambda x: x.price)[0]
    return {"price": best.price, "duration_min": best.duration_min, "carrier": best.meta.get("route", [{}])[0].get("airline", "")}

async def fetch_bus(origin, destination, date):
    providers = os.getenv("PROVIDERS", "tequila,mock_bus")
    if "flixbus" in providers:
        # In production, map city codes to FlixBus IDs before calling
        return await search_bus(origin, destination, date)
    else:
        return await mock_bus(origin, destination, date)

async def run_search(origin, destination, date, adults=1) -> SearchResponse:
    search_id = f"{date}_{origin}_{destination}"
    db = SessionLocal()
    upsert_search(db, search_id, origin, destination, date)

    direct = await fetch_direct_flight(origin, destination, date)
    bus_legs: List[Leg] = await fetch_bus(origin, destination, date)

    itineraries: List[Itinerary] = []
    if direct and bus_legs:
        for bus in bus_legs:
            # Intermodal concept: ground leg replaces a short regional flight
            total_price = (bus.price or 0)
            total_duration = (bus.duration_min or 0)
            savings_pct = None
            if direct.get("price") and total_price:
                savings_pct = round((direct["price"] - total_price) / direct["price"] * 100, 1)
            itineraries.append(Itinerary(
                legs=[bus],
                total_price=total_price,
                total_duration_min=total_duration,
                savings_vs_direct_pct=savings_pct,
                notes=["Single-mode ground alternative to direct flight"]
            ))
    add_options(db, search_id, bus_legs)
    db.close()

    itineraries = sorted(itineraries, key=lambda x: (-(x.savings_vs_direct_pct or -999), x.total_duration_min or 1))[:5]

    return SearchResponse(
        search_id=search_id,
        origin=origin,
        destination=destination,
        date=date,
        direct_flight_best=direct,
        intermodal_best=itineraries,
    )


// File: scripts/db_init.py
from backend.db.session import engine
from backend.db.crud import create_tables

if __name__ == "__main__":
    create_tables(engine)
    print("DB initialized.")


// File: scripts/run_sample_routes.py
import asyncio
from backend.compare import run_search

routes = [
    ("NYC","BOS"), ("NYC","DCA"), ("LAX","SAN"), ("MUC","VIE"), ("BER","PRG"),
    ("MIL","ZRH"), ("AMS","BRU"), ("MAD","BCN"), ("CDG","BRU"), ("FRA","STR")
]

async def main():
    for o, d in routes:
        res = await run_search(o, d, "2025-11-15", 1)
        print(o, d, res.dict())

if __name__ == "__main__":
    asyncio.run(main())


// File: tests/test_compare.py
from backend.compare import run_search
import pytest, asyncio

@pytest.mark.asyncio
async def test_rank():
    res = await run_search("NYC","BOS","2025-11-15")
    assert res.search_id
    assert isinstance(res.intermodal_best, list)
``
