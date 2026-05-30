"""
Diagnostic for emergency services dataset.

Shows breakdown by type, confidence, and data quality metrics.
"""

import sys
import sqlite3
from pathlib import Path
from collections import Counter

import click

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.logger import setup_logger


@click.command()
@click.option("--city", default="HYD", help="City code")
def main(city: str):
    """Analyze emergency services in the database."""
    
    project_root = Path(__file__).parent.parent
    db_path = project_root / "data" / "output" / city.lower() / f"{city.lower()}_risk_zones.db"
    log_dir = project_root / "logs"
    
    logger = setup_logger(name="es_analyzer", log_dir=log_dir)
    
    if not db_path.exists():
        logger.error(f"Database not found: {db_path}")
        return
    
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    
    logger.info("=" * 70)
    logger.info("EMERGENCY SERVICES DATASET ANALYSIS")
    logger.info("=" * 70)
    
    # ─── Total Count ───
    total = conn.execute("SELECT COUNT(*) FROM emergency_services").fetchone()[0]
    logger.info(f"\nTotal services: {total}")
    
    # ─── By Service Type ───
    logger.info("\n[BY SERVICE TYPE]")
    by_type = conn.execute("""
        SELECT service_type, COUNT(*) as cnt
        FROM emergency_services
        GROUP BY service_type
        ORDER BY cnt DESC
    """).fetchall()
    
    for row in by_type:
        pct = (row['cnt'] / total) * 100
        logger.info(f"  {row['service_type']:20s}: {row['cnt']:4d}  ({pct:5.1f}%)")
    
    # ─── By Confidence Level ───
    logger.info("\n[BY CONFIDENCE LEVEL]")
    by_conf = conn.execute("""
        SELECT confidence_level, COUNT(*) as cnt
        FROM emergency_services
        GROUP BY confidence_level
        ORDER BY confidence_level DESC
    """).fetchall()
    
    confidence_labels = {1: "Low", 2: "Medium", 3: "High", 4: "Verified"}
    for row in by_conf:
        label = confidence_labels.get(row['confidence_level'], "?")
        pct = (row['cnt'] / total) * 100
        logger.info(f"  Level {row['confidence_level']} ({label:8s}): {row['cnt']:4d}  ({pct:5.1f}%)")
    
    # ─── Data Completeness ───
    logger.info("\n[DATA COMPLETENESS]")
    
    metrics = {
        "Has phone number":       "phone IS NOT NULL AND phone != ''",
        "Has emergency phone":    "phone_emergency IS NOT NULL",
        "Has website":            "website IS NOT NULL AND website != ''",
        "Has email":              "email IS NOT NULL AND email != ''",
        "Has full address":       "address_full IS NOT NULL",
        "Has street address":     "address_street IS NOT NULL",
        "Has opening hours":      "opening_hours IS NOT NULL",
        "Is 24/7":                "is_24_7 = 1",
        "Has emergency dept":     "has_emergency = 1",
        "Has speciality":         "speciality IS NOT NULL",
        "Has operator info":      "operator IS NOT NULL",
        "Has wheelchair info":    "wheelchair IS NOT NULL",
        "Has bed count":          "beds IS NOT NULL",
    }
    
    for label, condition in metrics.items():
        cnt = conn.execute(
            f"SELECT COUNT(*) FROM emergency_services WHERE {condition}"
        ).fetchone()[0]
        pct = (cnt / total) * 100 if total > 0 else 0
        logger.info(f"  {label:25s}: {cnt:4d}  ({pct:5.1f}%)")
    
    # ─── Top Verified Services ───
    logger.info("\n[TOP 10 VERIFIED SERVICES]")
    top = conn.execute("""
        SELECT name, service_type, confidence_score, phone, address_full
        FROM emergency_services
        WHERE confidence_level = 4
        ORDER BY confidence_score DESC, name
        LIMIT 10
    """).fetchall()
    
    if not top:
        logger.info("  No verified services found")
    else:
        for i, row in enumerate(top, 1):
            logger.info(f"\n  #{i} {row['name']}")
            logger.info(f"     Type: {row['service_type']}")
            logger.info(f"     Score: {row['confidence_score']:.2f}")
            if row['phone']:
                logger.info(f"     Phone: {row['phone']}")
            if row['address_full']:
                logger.info(f"     Address: {row['address_full']}")
    
    # ─── 24/7 Services ───
    logger.info("\n[24/7 SERVICES]")
    services_247 = conn.execute("""
        SELECT name, service_type, phone
        FROM emergency_services
        WHERE is_24_7 = 1
        ORDER BY service_type, name
        LIMIT 20
    """).fetchall()
    
    logger.info(f"  Total 24/7 services: {len(services_247)}")
    if services_247:
        for row in services_247[:10]:
            phone_str = f" ({row['phone']})" if row['phone'] else ""
            logger.info(f"  • {row['name']} [{row['service_type']}]{phone_str}")
    
    conn.close()
    logger.info("\n" + "=" * 70)


if __name__ == "__main__":
    main()