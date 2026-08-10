from sqlalchemy import select, func
from app.db import SessionLocal
from app.models.appointment import Appointment

db = SessionLocal()
print(
    "count",
    db.scalar(
        select(func.count())
        .select_from(Appointment)
        .where(Appointment.title.ilike("%Gabriel%"))
    ),
)
rows = db.scalars(
    select(Appointment)
    .where(Appointment.title.ilike("%Gabriel%"))
    .order_by(Appointment.starts_at)
    .limit(5)
).all()
for r in rows:
    print(r.starts_at.isoformat(), r.ends_at.isoformat(), r.title, r.cycle_id)
db.close()
