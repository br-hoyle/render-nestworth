from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    accounts,
    admin,
    auth,
    balances,
    calculators,
    health,
    income,
    scenarios,
    scorecard,
    settings as settings_router,
    transactions,
)

app = FastAPI(title="NestWorth API")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_allow_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(accounts.router)
app.include_router(income.router)
app.include_router(balances.router)
app.include_router(settings_router.router)
app.include_router(transactions.router)
app.include_router(scorecard.router)
app.include_router(calculators.router)
app.include_router(scenarios.router)
