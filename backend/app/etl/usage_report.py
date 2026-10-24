"""
Reads the website's usage counts (app.etl.usage_setup) – where explaining is worth it: which pages are seen, which of
their settings get changed and to what (a setting nobody changes is either right as it is, or not found), which areas
are looked at, what is shared and exported, how the tour and the tips fare. As the owner (DATABASE_URL), the API's role
can't read.

    cd backend
    uv run python -m app.etl.usage_report

A view's link holds only what differs from the page's defaults, so a setting in an "Ansicht" is one the person
changed. The first view of a visit carries besuch=neu: the visits.
"""

from collections import Counter, defaultdict

from sqlalchemy import text

from app.etl.usage_setup import DATABASE, admin_engine, usage_database_exists

WINDOWS = (7, 30)  # days back, side by side
TOP_VALUES = 6  # per setting
# The settings of a view that are where it is, not what it shows
PLACE = {"seite", "gebiet", "land", "kreis", "besuch"}

EVENTS = """
    SELECT event, props, day >= current_date - :short AS recent
    FROM usage.events
    WHERE day >= current_date - :long
"""


def share(part: int, whole: int) -> str:
    return f"{100 * part / whole:5.1f} %" if whole else "    –  "


def top(counter: Counter, whole: int, n: int = TOP_VALUES) -> str:
    return ", ".join(f"{value} {100 * count / whole:.0f} %" for value, count in counter.most_common(n))


def report() -> None:
    if not usage_database_exists(admin_engine()):
        print(f"No database {DATABASE}: usage counts aren't set up (python -m app.etl.usage_setup).")
        return
    short, long = WINDOWS
    with admin_engine(DATABASE).connect() as conn:
        conn.execute(text("SELECT usage.prune()"))
        rows = conn.execute(text(EVENTS), {"short": short, "long": long}).all()

    print(f"\nNutzung der letzten {short} und {long} Tage\n")
    if not rows:
        print("    noch nichts gezählt")
        return

    # What happened, how often
    counts = Counter((r.event, r.recent) for r in rows)
    print(f"{'':28}{short:>8} T{long:>9} T")
    for event in sorted({r.event for r in rows}, key=lambda e: -sum(c for (ev, _), c in counts.items() if ev == e)):
        recent = counts[(event, True)]
        print(f"  {event:26}{recent:>10,}{recent + counts[(event, False)]:>11,}")
    visits = sum(1 for r in rows if r.event == "Ansicht" and r.props.get("besuch") == "neu")
    print(f"  {'Besuche (erste Ansicht)':26}{'':>10}{visits:>11,}")

    # The pages, and per page which settings were changed (share of its views) and to what
    views = [r.props for r in rows if r.event == "Ansicht"]
    by_page: dict[str, list[dict]] = defaultdict(list)
    for props in views:
        by_page[props.get("seite", "?")].append(props)
    print(f"\nSeiten und ihre Einstellungen ({long} Tage) – Anteil der Ansichten, in denen sie geändert war\n")
    for page, page_views in sorted(by_page.items(), key=lambda item: -len(item[1])):
        print(f"  {page}  ·  {len(page_views):,} Ansichten")
        settings = Counter(key for props in page_views for key in props if key not in PLACE)
        for key, changed in settings.most_common():
            values = Counter(props[key] for props in page_views if key in props)
            print(f"      {key:14}{share(changed, len(page_views))}   {top(values, changed)}")
        untouched = len(page_views) - sum(1 for props in page_views if set(props) - PLACE)
        print(f"      {'(nichts)':14}{share(untouched, len(page_views))}   alles wie voreingestellt\n")

    # The areas looked at
    areas = Counter(props.get("gebiet", "deutschland") for props in views)
    kreise = Counter(props["kreis"] for props in views if "kreis" in props)
    print(f"Gebiete ({long} Tage): {top(areas, len(views), 3)}")
    if kreise:
        print(f"  meistgesehene Kreise: {', '.join(f'{k} ({c})' for k, c in kreise.most_common(10))}")

    # Sharing, exports, the guide
    def tally(event: str, key: str) -> str:
        values = Counter(r.props.get(key, "?") for r in rows if r.event == event)
        return ", ".join(f"{value} {count}" for value, count in values.most_common()) or "–"

    print(f"\nTeilen: {tally('Teilen', 'seite')}")
    print(f"Grafikexport: {tally('Grafikexport', 'format')}  ·  Kartenexport: {tally('Kartenexport', 'format')}")
    print(f"Tour: {tally('Tour', 'aktion')}")
    tips = Counter((r.props.get("tipp", "?"), r.props.get("aktion", "?")) for r in rows if r.event == "Tipp")
    for tip in sorted({t for t, _ in tips}):
        print(f"Tipp {tip}: " + ", ".join(f"{action} {count}" for (t, action), count in tips.items() if t == tip))


if __name__ == "__main__":
    report()
