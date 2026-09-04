"""Shared human-facing formatting helpers — pt-BR locale, no external deps."""


def format_brl_cents(cents: int | None) -> str:
    """Format an integer cent amount as a pt-BR currency string, e.g. 30000 -> "R$ 300,00"."""
    value = (cents or 0) / 100
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
