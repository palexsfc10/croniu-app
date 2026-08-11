"""Authoritative temporal context for the Croniu assistant (org timezone)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.schemas.agenda import DEFAULT_ORG_TIMEZONE

WEEKDAYS_PT = (
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
)

MONTHS_PT = (
    "",
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
)


def resolve_org_timezone(tz_name: str | None) -> str:
    """Return a valid IANA timezone; never silently use the container TZ."""
    cleaned = (tz_name or "").strip() or DEFAULT_ORG_TIMEZONE
    try:
        ZoneInfo(cleaned)
        return cleaned
    except ZoneInfoNotFoundError:
        return DEFAULT_ORG_TIMEZONE


@dataclass(frozen=True)
class TemporalContext:
    timezone: str
    locale: str
    now_utc: datetime
    now_local: datetime
    current_local_date: date
    current_local_time: time
    current_weekday: str
    tomorrow: date
    day_after_tomorrow: date
    yesterday: date

    def as_prompt_dict(self) -> dict[str, str]:
        return {
            "current_datetime_utc": self.now_utc.isoformat(),
            "current_datetime_local": self.now_local.isoformat(),
            "current_local_date": self.current_local_date.isoformat(),
            "current_local_time": self.current_local_time.strftime("%H:%M:%S"),
            "current_weekday": self.current_weekday,
            "timezone": self.timezone,
            "locale": self.locale,
            "hoje": self.current_local_date.isoformat(),
            "amanha": self.tomorrow.isoformat(),
            "depois_de_amanha": self.day_after_tomorrow.isoformat(),
            "ontem": self.yesterday.isoformat(),
        }


def build_temporal_context(
    *,
    org_timezone: str | None,
    now: datetime | None = None,
    locale: str = "pt-BR",
) -> TemporalContext:
    tz_name = resolve_org_timezone(org_timezone)
    tz = ZoneInfo(tz_name)
    now_utc = (now or datetime.now(UTC)).astimezone(UTC)
    now_local = now_utc.astimezone(tz)
    local_date = now_local.date()
    return TemporalContext(
        timezone=tz_name,
        locale=locale,
        now_utc=now_utc,
        now_local=now_local,
        current_local_date=local_date,
        current_local_time=now_local.time().replace(microsecond=0),
        current_weekday=WEEKDAYS_PT[now_local.weekday()],
        tomorrow=local_date + timedelta(days=1),
        day_after_tomorrow=local_date + timedelta(days=2),
        yesterday=local_date - timedelta(days=1),
    )


def next_weekday_on_or_after(from_date: date, weekday: int) -> date:
    """weekday: Monday=0 … Sunday=6 (Python)."""
    delta = (weekday - from_date.weekday()) % 7
    return from_date + timedelta(days=delta)


def next_weekday_strictly_after(from_date: date, weekday: int) -> date:
    delta = (weekday - from_date.weekday()) % 7
    if delta == 0:
        delta = 7
    return from_date + timedelta(days=delta)


def resolve_relative_date_token(token: str, ctx: TemporalContext) -> date | None:
    """Deterministic mapping for common PT-BR relative day tokens (tests + prompt aids)."""
    key = (
        token.strip()
        .lower()
        .replace("á", "a")
        .replace("ã", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ç", "c")
    )
    today = ctx.current_local_date
    mapping = {
        "hoje": today,
        "amanha": ctx.tomorrow,
        "depois de amanha": ctx.day_after_tomorrow,
        "depois_de_amanha": ctx.day_after_tomorrow,
        "ontem": ctx.yesterday,
    }
    if key in mapping:
        return mapping[key]

    weekday_aliases = {
        "segunda": 0,
        "segunda-feira": 0,
        "terca": 1,
        "terca-feira": 1,
        "quarta": 2,
        "quarta-feira": 2,
        "quinta": 3,
        "quinta-feira": 3,
        "sexta": 4,
        "sexta-feira": 4,
        "sabado": 5,
        "domingo": 6,
    }
    if key.startswith("proxima ") or key.startswith("proximo "):
        rest = key.split(" ", 1)[1]
        if rest in weekday_aliases:
            return next_weekday_strictly_after(today, weekday_aliases[rest])
    if key.startswith("esta ") or key.startswith("esse "):
        rest = key.split(" ", 1)[1]
        if rest in weekday_aliases:
            return next_weekday_on_or_after(today, weekday_aliases[rest])
    if key in weekday_aliases:
        # Bare weekday → upcoming occurrence including today
        return next_weekday_on_or_after(today, weekday_aliases[key])
    return None


def format_human_datetime_range(
    starts_at: datetime,
    ends_at: datetime,
    *,
    timezone: str,
    include_timezone: bool = False,
) -> str:
    """e.g. 'sexta-feira, 7 de agosto de 2026, das 08:00 às 09:00'."""
    tz = ZoneInfo(resolve_org_timezone(timezone))
    start = starts_at if starts_at.tzinfo else starts_at.replace(tzinfo=UTC)
    end = ends_at if ends_at.tzinfo else ends_at.replace(tzinfo=UTC)
    start_l = start.astimezone(tz)
    end_l = end.astimezone(tz)
    wd = WEEKDAYS_PT[start_l.weekday()]
    month = MONTHS_PT[start_l.month]
    body = (
        f"{wd}, {start_l.day} de {month} de {start_l.year}, "
        f"das {start_l.strftime('%H:%M')} às {end_l.strftime('%H:%M')}"
    )
    if include_timezone:
        return f"{body} ({tz.key})"
    return body


def format_temporal_system_block(ctx: TemporalContext) -> str:
    d = ctx.as_prompt_dict()
    return f"""## Relógio autoritativo do profissional (obrigatório)
Use SOMENTE este relógio. Não invente a data atual, não use UTC como “hoje” do profissional e não use conhecimento interno de calendário.

- timezone IANA: {d['timezone']}
- locale: {d['locale']}
- current_datetime_utc: {d['current_datetime_utc']}
- current_datetime_local: {d['current_datetime_local']}
- current_local_date (hoje): {d['current_local_date']} ({d['current_weekday']})
- current_local_time: {d['current_local_time']}
- amanhã: {d['amanha']}
- depois de amanhã: {d['depois_de_amanha']}
- ontem (somente consultas): {d['ontem']}

### Resolução de expressões em português (Brasil)
- “hoje” → {d['current_local_date']}
- “amanhã” → {d['amanha']} (mesmo se em UTC já for outro dia)
- “depois de amanhã” → {d['depois_de_amanha']}
- “sexta-feira” / “esta sexta” → próxima ocorrência a partir de hoje (incluindo hoje se já for sexta)
- “próxima sexta” → a sexta estritamente posterior a hoje
- “às oito” / “8h” sem período → se ambíguo (manhã vs noite), PERGUNTE antes de propor
- “oito da manhã” → 08:00 local; “oito da noite” → 20:00 local
- “meio-dia” → 12:00; “meia-noite” → 00:00 do dia referido
- Não crie compromisso no passado. Se o horário resolvido já passou no fuso do profissional, peça esclarecimento ou sugira a próxima ocorrência — sem executar.

### Tools de escrita temporal
Ao chamar propose_* com datas/horários, passe sempre instantes absolutos com offset no fuso {d['timezone']} (ISO-8601). Nunca passe a string “amanhã” como argumento de tool.
Nas propostas ao usuário, descreva a data de forma humana inequívoca (dia da semana + data + horário), não apenas “amanhã às 8”.

### Correções na conversa
Se o usuário corrigir uma proposta pendente (“na verdade às nove”, “é a Mariana”), NÃO execute a proposta anterior. Produza uma NOVA proposta corrigida usando o contexto (cliente/data/horário já discutidos) e peça nova confirmação.
"""
