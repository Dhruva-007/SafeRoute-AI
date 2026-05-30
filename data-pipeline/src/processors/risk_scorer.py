"""
Risk scorer: computes composite risk scores using weighted components.

Implements the formula defined in config/scoring_weights.yaml:
  Final Score = Σ (Factor_i × Weight_i)
"""

import logging
from typing import Dict, List, Optional, Tuple

from src.models.risk_zone import RiskFactor, SeverityLevel


class RiskScorer:
    """Computes composite risk scores."""
    
    def __init__(
        self,
        scoring_config: Dict,
        categories_config: Dict,
    ):
        self.logger = logging.getLogger(__name__)
        self.scoring_config = scoring_config["scoring"]
        self.categories_config = categories_config["categories"]
        
        # Pre-extract for performance
        self.weights = self.scoring_config["weights"]
        self.tag_modifiers = self.scoring_config["tag_modifiers"]
        self.max_tag_modifier = self.scoring_config["max_tag_modifier"]
        self.distance_modifiers = self.scoring_config[
            "emergency_distance_modifiers"
        ]
        self.severity_thresholds = self.scoring_config["severity_thresholds"]
        
        # Validate weights sum to 1.0
        total = sum(self.weights.values())
        if abs(total - 1.0) > 0.01:
            self.logger.warning(
                f"Scoring weights sum to {total}, should be 1.0"
            )
    
    def compute_score(
        self,
        category: str,
        tags: Dict[str, str],
        emergency_distance_km: Optional[float] = None,
    ) -> Tuple[float, SeverityLevel, List[RiskFactor]]:
        """
        Compute composite risk score using calibrated formula:
        
            weighted_score = (category_base × W_cat) 
                        + (lighting × W_light) 
                        + (isolation × W_iso)
                        + (emergency_distance_normalized × W_em)
            
            final_score = weighted_score + tag_bonus
            
            clamped to [0, 1]
        
        Returns:
            (final_score, severity_level, list_of_risk_factors)
        """
        factors: List[RiskFactor] = []
        
        # ─── 1. Category Base Score (PRIMARY signal) ───
        cat_config = self.categories_config.get(category, {})
        base_score = cat_config.get("base_risk_score", 0.5)
        
        factors.append(
            RiskFactor(
                name="category_base",
                score=base_score,
                weight=self.weights["category_base"],
                source="category_config",
            )
        )
        
        # ─── 2. Lighting Condition ───
        lit_value = tags.get("lit", "unknown")
        if lit_value == "no":
            lighting_score = 1.0
        elif lit_value == "disused":
            lighting_score = 0.7
        elif lit_value == "yes":
            lighting_score = 0.0
        else:
            lighting_score = 0.3  # Unknown
        
        factors.append(
            RiskFactor(
                name="lighting_condition",
                score=lighting_score,
                weight=self.weights["lighting_condition"],
                source=f"lit={lit_value}",
            )
        )
        
        # ─── 3. Isolation Score (per-category estimate) ───
        isolation_score = self._estimate_isolation(category)
        factors.append(
            RiskFactor(
                name="isolation_score",
                score=isolation_score,
                weight=self.weights["isolation_score"],
                source="category_estimate",
            )
        )
        
        # ─── 4. Emergency Distance ───
        if emergency_distance_km is not None:
            em_modifier = self._distance_to_modifier(emergency_distance_km)
            # Normalize: max possible modifier is 0.25
            em_normalized = em_modifier / 0.25 if em_modifier > 0 else 0.0
            
            factors.append(
                RiskFactor(
                    name="emergency_distance",
                    score=em_normalized,
                    weight=self.weights["emergency_distance"],
                    source=f"distance: {emergency_distance_km:.2f} km",
                )
            )
        
        # ─── 5. Compute Weighted Score ───
        weighted_score = sum(f.score * f.weight for f in factors)
        
        # ─── 6. Tag Bonus (ADDED on top) ───
        tag_bonus = 0.0
        applied_tags = []
        
        for tag_pattern, modifier_value in self.tag_modifiers.items():
            key, value = tag_pattern.split("=")
            if tags.get(key) == value:
                tag_bonus += modifier_value
                applied_tags.append(tag_pattern)
        
        # Cap the tag bonus
        tag_bonus = min(tag_bonus, self.max_tag_modifier)
        
        if tag_bonus > 0:
            factors.append(
                RiskFactor(
                    name="tag_bonus",
                    score=tag_bonus,  # Stored as raw value (already a modifier)
                    weight=1.0,       # Applied directly, not weighted
                    source=f"applied_tags: {','.join(applied_tags)}",
                )
            )
        
        # ─── 7. Final Score ───
        final_score = weighted_score + tag_bonus
        
        # Clamp to [0, 1]
        final_score = max(0.0, min(1.0, final_score))
        
        # ─── 8. Determine Severity ───
        severity = self._score_to_severity(final_score)
        
        return final_score, severity, factors
    
    def _distance_to_modifier(self, distance_km: float) -> float:
        """Map emergency distance to modifier value."""
        for tier in self.distance_modifiers:
            if distance_km <= tier["max_km"]:
                return tier["modifier"]
        return self.distance_modifiers[-1]["modifier"]
    
    def _estimate_isolation(self, category: str) -> float:
        """Estimate isolation risk based on category."""
        # Heuristic per category
        isolation_map = {
            "abandoned": 0.8,
            "industrial": 0.5,
            "restricted": 0.7,
            "poorly_lit_roads": 0.6,
            "unsafe_transit": 0.4,
            "accident_junction": 0.2,
        }
        return isolation_map.get(category, 0.3)
    
    def _score_to_severity(self, score: float) -> SeverityLevel:
        """Map a score to a severity level."""
        for level_str, threshold in self.severity_thresholds.items():
            if threshold["min"] <= score < threshold["max"]:
                return SeverityLevel(int(level_str))
        return SeverityLevel.LOW