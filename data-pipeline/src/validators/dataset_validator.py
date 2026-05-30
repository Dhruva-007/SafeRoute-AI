"""
Dataset validator: ensures final output meets quality standards.
"""

import logging
from typing import List, Dict, Any

from src.models.risk_zone import RiskZone, SeverityLevel


class DatasetValidator:
    """Validates the final processed dataset."""
    
    def __init__(self, min_zones_per_category: int = 1):
        self.logger = logging.getLogger(__name__)
        self.min_zones_per_category = min_zones_per_category
    
    def validate(self, zones: List[RiskZone]) -> Dict[str, Any]:
        """
        Run all validation checks.
        
        Returns a report dict with pass/fail status.
        """
        report = {
            "total_zones": len(zones),
            "passed": True,
            "checks": [],
            "warnings": [],
            "errors": [],
        }
        
        # Check 1: No empty dataset
        self._check_not_empty(zones, report)
        
        # Check 2: All severity levels present (or at least 3 of 4)
        self._check_severity_coverage(zones, report)
        
        # Check 3: No duplicate UUIDs
        self._check_no_duplicate_uuids(zones, report)
        
        # Check 4: All zones have valid geometry
        self._check_geometry_validity(zones, report)
        
        # Check 5: Score range is [0, 1]
        self._check_score_range(zones, report)
        
        # Check 6: At least one zone per configured category
        self._check_category_coverage(zones, report)
        
        # Final status
        if report["errors"]:
            report["passed"] = False
        
        self._log_report(report)
        
        return report
    
    def _check_not_empty(self, zones: List[RiskZone], report: Dict):
        if len(zones) == 0:
            report["errors"].append("Dataset is empty")
        else:
            report["checks"].append(f"✓ Dataset contains {len(zones)} zones")
    
    def _check_severity_coverage(self, zones: List[RiskZone], report: Dict):
        levels = set(z.severity_level for z in zones)
        if len(levels) < 3:
            report["warnings"].append(
                f"Only {len(levels)} severity levels present. Expected at least 3."
            )
        else:
            report["checks"].append(f"✓ All 4 severity levels present")
    
    def _check_no_duplicate_uuids(self, zones: List[RiskZone], report: Dict):
        uuids = [z.zone_uuid for z in zones]
        if len(uuids) != len(set(uuids)):
            report["errors"].append("Duplicate zone_uuids found")
        else:
            report["checks"].append("✓ No duplicate UUIDs")
    
    def _check_geometry_validity(self, zones: List[RiskZone], report: Dict):
        invalid = 0
        for zone in zones:
            try:
                geom = zone.to_shapely()
                if geom.is_empty or not geom.is_valid:
                    invalid += 1
            except Exception:
                invalid += 1
        
        if invalid > 0:
            report["errors"].append(f"{invalid} zones have invalid geometry")
        else:
            report["checks"].append("✓ All geometries valid")
    
    def _check_score_range(self, zones: List[RiskZone], report: Dict):
        out_of_range = [z for z in zones if not (0.0 <= z.risk_score <= 1.0)]
        if out_of_range:
            report["errors"].append(f"{len(out_of_range)} zones have invalid scores")
        else:
            report["checks"].append("✓ All scores in [0.0, 1.0]")
    
    def _check_category_coverage(self, zones: List[RiskZone], report: Dict):
        by_category = {}
        for z in zones:
            by_category[z.risk_category] = by_category.get(z.risk_category, 0) + 1
        
        for cat, count in by_category.items():
            if count < self.min_zones_per_category:
                report["warnings"].append(
                    f"Category '{cat}' has only {count} zones"
                )
        
        report["checks"].append(f"✓ {len(by_category)} categories present")
    
    def _log_report(self, report: Dict):
        self.logger.info("=" * 60)
        self.logger.info("DATASET VALIDATION REPORT")
        self.logger.info("=" * 60)
        
        for check in report["checks"]:
            self.logger.info(f"  {check}")
        
        for warning in report["warnings"]:
            self.logger.warning(f"  ⚠ {warning}")
        
        for error in report["errors"]:
            self.logger.error(f"  ✗ {error}")
        
        status = "PASSED" if report["passed"] else "FAILED"
        self.logger.info(f"\nOverall: {status}")
        self.logger.info("=" * 60)