"""Read-only inspection utility for the Pool Petiscos SQLite database.

This script deliberately opens SQLite with ``mode=ro``. It is intended for
owners and reviewers who need to confirm counts, integrity and readable views
without risking accidental changes to the live database.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

DATABASE_FILENAME = "pool-petiscos.db"
READABLE_VIEWS = {
    "produtos": "vw_produtos",
    "vendas": "vw_vendas",
    "itens-venda": "vw_itens_venda",
    "despesas": "vw_despesas",
    "movimentos-caixa": "vw_movimentos_caixa",
    "fechamentos-caixa": "vw_fechamentos_caixa",
}


def default_database_path() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    root = Path(local_app_data) if local_app_data else Path.home() / ".local"
    return root / "PoolPetiscos" / "data" / DATABASE_FILENAME


def inspect_database(
    database_path: Path,
    *,
    view: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    resolved = database_path.expanduser().resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"Banco não encontrado: {resolved}")

    connection = sqlite3.connect(
        f"{resolved.as_uri()}?mode=ro",
        uri=True,
        timeout=5,
    )
    connection.row_factory = sqlite3.Row
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        state = connection.execute(
            """
            SELECT revision, saved_at
            FROM app_state
            WHERE id = 1
            """
        ).fetchone()
        available_views = {
            row[0]
            for row in connection.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'view'
                """
            )
        }
        counts = {
            label: (
                connection.execute(
                    f'SELECT COUNT(*) FROM "{view_name}"'
                ).fetchone()[0]
                if view_name in available_views
                else None
            )
            for label, view_name in READABLE_VIEWS.items()
        }
        report: dict[str, Any] = {
            "arquivo": str(resolved),
            "tamanho_bytes": resolved.stat().st_size,
            "integridade": integrity,
            "revisao": int(state["revision"]) if state is not None else None,
            "salvo_em": state["saved_at"] if state is not None else None,
            "registros": counts,
        }
        if view is not None:
            view_name = READABLE_VIEWS[view]
            if view_name not in available_views:
                raise RuntimeError(
                    "As consultas legíveis ainda não existem neste banco. "
                    "Atualize e abra o Pool Petiscos uma vez."
                )
            rows = connection.execute(
                f'SELECT * FROM "{view_name}" LIMIT ?',
                (limit,),
            ).fetchall()
            report["consulta"] = view
            report["linhas"] = [dict(row) for row in rows]
        return report
    finally:
        connection.close()


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspeciona o banco Pool Petiscos sem alterá-lo."
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=default_database_path(),
        help="caminho alternativo para pool-petiscos.db",
    )
    parser.add_argument(
        "--view",
        choices=tuple(READABLE_VIEWS),
        help="inclui até 20 linhas de uma consulta legível",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="limite de linhas quando --view é informado (1 a 200)",
    )
    return parser.parse_args()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    arguments = parse_arguments()
    if not 1 <= arguments.limit <= 200:
        raise SystemExit("--limit precisa estar entre 1 e 200.")
    try:
        report = inspect_database(
            arguments.database,
            view=arguments.view,
            limit=arguments.limit,
        )
    except (FileNotFoundError, RuntimeError, sqlite3.Error) as error:
        raise SystemExit(str(error)) from error
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
