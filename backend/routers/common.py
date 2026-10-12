"""
Helpers shared by the routers.
"""
import json

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Case, User
from modules.graph_manager import CrimeGraph


async def get_owned_case(db: AsyncSession, case_id: int, user: User) -> Case:
    case = (await db.execute(
        select(Case).where(Case.id == case_id, Case.user_id == user.id)
    )).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


def load_graph(case: Case) -> CrimeGraph:
    graph = CrimeGraph()
    if case.graph_json:
        try:
            graph.from_json(json.loads(case.graph_json))
        except Exception as e:  # a corrupt graph must not lock the investigator out of the case
            print(f"[ERROR] loading graph for case {case.id}: {type(e).__name__}: {e}")
    return graph


def save_graph(case: Case, graph: CrimeGraph) -> None:
    case.graph_json = json.dumps(graph.to_json(), default=str)


def iso(dt) -> str:
    return dt.isoformat() if dt else ""
