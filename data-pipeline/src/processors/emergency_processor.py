"""
Emergency Services Processor.

Validates, enriches, and scores emergency services with strict 
quality requirements for production safety use.

UPDATED FOR PHASE 1.5: Uses single combined query and classifies 
service types from OSM tags instead of pre-categorized data.
"""

import logging
import re
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict

from src.models.emergency_service import (
    EmergencyService,
    ServiceType,
    ServicePriority,
    ConfidenceLevel,
)
from src.utils.geo_utils import haversine_km


class EmergencyServiceProcessor:
    """Processes raw OSM emergency data into validated services."""
    
    # ─── Service Priority Mapping ───
    SERVICE_PRIORITY = {
        ServiceType.HOSPITAL: ServicePriority.CRITICAL,
        ServiceType.POLICE: ServicePriority.CRITICAL,
        ServiceType.FIRE_STATION: ServicePriority.CRITICAL,
        ServiceType.AMBULANCE: ServicePriority.HIGH,
        ServiceType.PHARMACY_24H: ServicePriority.HIGH,
        ServiceType.CLINIC: ServicePriority.MEDIUM,
        ServiceType.SHELTER: ServicePriority.MEDIUM,
        ServiceType.HELIPAD: ServicePriority.HIGH,
    }
    
    # ─── Indian Phone Number Pattern ───
    INDIAN_PHONE_PATTERN = re.compile(
        r'^(\+91[\s-]?)?[6-9]\d{9}$|'  # mobile
        r'^(\+91[\s-]?)?\d{2,4}[\s-]?\d{6,8}$'  # landline
    )
    
    # Deduplication threshold (km) — services within this distance with similar names = duplicates
    DEDUP_DISTANCE_KM = 0.05  # 50 meters
    NAME_SIMILARITY_THRESHOLD = 0.85
    
    def __init__(self, city_code: str, city_bbox: Dict):
        self.city_code = city_code
        self.city_bbox = city_bbox
        self.logger = logging.getLogger(__name__)
        
        # Track stats
        self.stats = {
            "total_processed": 0,
            "validated": 0,
            "rejected_no_classification": 0,
            "rejected_no_name": 0,
            "rejected_no_location": 0,
            "rejected_outside_bbox": 0,
            "rejected_duplicate": 0,
            "rejected_low_confidence": 0,
            "by_confidence": {1: 0, 2: 0, 3: 0, 4: 0},
            "by_type": {},
        }
    
    def process_all(self, raw_data: Dict[str, Dict]) -> List[EmergencyService]:
        """
        Process all emergency services from combined OSM extraction.
        
        Classifies service type from OSM tags (rather than pre-categorization).
        """
        all_services = []
        
        # The extractor now returns a single combined dataset
        for query_name, data in raw_data.items():
            elements = data.get("elements", [])
            self.logger.info(f"Processing {len(elements)} raw OSM elements")
            
            for elem in elements:
                self.stats["total_processed"] += 1
                
                try:
                    # Determine service type from OSM tags
                    service_type = self._classify_service_type(elem)
                    if not service_type:
                        self.stats["rejected_no_classification"] += 1
                        continue
                    
                    service = self._build_service(elem, service_type)
                    if service:
                        all_services.append(service)
                        self.stats["validated"] += 1
                        self.stats["by_confidence"][service.confidence_level] += 1
                        type_name = service.service_type.value
                        self.stats["by_type"][type_name] = (
                            self.stats["by_type"].get(type_name, 0) + 1
                        )
                except _ValidationError as ve:
                    key = f"rejected_{ve.reason}"
                    self.stats[key] = self.stats.get(key, 0) + 1
                except Exception as e:
                    self.logger.debug(f"Error processing element: {e}")
        
        # Deduplicate across all services
        self.logger.info(f"Deduplicating {len(all_services)} services...")
        deduplicated = self._deduplicate(all_services)
        
        self.logger.info(f"Final count: {len(deduplicated)} services")
        self._log_stats()
        
        return deduplicated
    
    def _classify_service_type(self, element: Dict) -> Optional[ServiceType]:
        """
        Classify an OSM element into a service type based on tags.
        
        ENHANCED: Uses multiple signals to distinguish:
        - Real hospitals (large facilities with ER)
        - Clinics (smaller medical facilities)
        - Specialty offices (dental, dermatology, etc.) — REJECTED
        
        Returns None if the element doesn't match any emergency service category
        or doesn't meet quality thresholds.
        """
        tags = element.get("tags", {})
        
        amenity = tags.get("amenity", "")
        emergency = tags.get("emergency", "")
        healthcare = tags.get("healthcare", "")
        shelter_type = tags.get("shelter_type", "")
        opening_hours = tags.get("opening_hours", "")
        name = tags.get("name", "").lower()
        speciality = tags.get("healthcare:speciality", "").lower()
        
        # ─── REJECT: Specialty clinics/offices that aren't emergency-capable ───
        # These are tagged as "hospital" in OSM but are actually specialty offices
        SPECIALTY_REJECT_KEYWORDS = [
            "dental", "dentist", "orthodontic",
            "ayurvedic", "ayurveda", "homeopathy", "homeopathic",
            "physiotherapy", "physio", "rehabilitation",
            "skin clinic", "dermatology", "cosmetic",
            "ivf", "fertility",
            "eye clinic", "optical", "optician",
            "hair clinic", "hair transplant",
            "weight loss", "weight management",
            "diagnostic center", "diagnostic centre", "diagnostics",
            "lab", "laboratory", "pathology",
            "pharmacy",  # avoid pharmacies tagged as hospitals
            "veterinary", "pet clinic", "animal",
            "yoga", "wellness",
            "spa", "salon",
        ]
        
        SPECIALTY_REJECT_SPECIALITIES = [
            "dentistry", "dental",
            "ophthalmology",  # eye-only clinics
            "dermatology",
            "physiotherapy",
            "alternative",
            "ayurveda",
            "homeopathy",
        ]
        
        # Check if name contains specialty keywords (REJECT these)
        if any(kw in name for kw in SPECIALTY_REJECT_KEYWORDS):
            return None
        
        # Check speciality field
        if any(spec in speciality for spec in SPECIALTY_REJECT_SPECIALITIES):
            return None
        
        # ─── HOSPITALS: Strict criteria ───
                # ─── HOSPITALS: Strict criteria ───
        if amenity == "hospital" or healthcare == "hospital":
            
            # ADDITIONAL REJECT: Single-doctor or specialty practice patterns
            DOCTOR_OFFICE_PATTERNS = [
                "dr ", "dr.", "doctor ",
                "gynecologist", "gynaecologist",
                "pediatrician", "paediatrician",
                "cardiologist", "neurologist",
                "psychiatrist", "psychologist",
                "orthopedic", "orthopaedic",
                "urologist", "nephrologist",
                "endocrinologist",
                "pain clinic", "pain management",
                "fertility center", "fertility centre",
                "ivf center", "ivf centre",
                "diabetes center", "diabetes centre",
            ]
            
            # If name starts with "Dr" or contains specialist titles,
            # it's likely a single-doctor office, not a hospital
            for pattern in DOCTOR_OFFICE_PATTERNS:
                if pattern in name:
                    # Exception: if it has emergency=yes OR significant beds, allow it
                    if tags.get("emergency") == "yes":
                        return ServiceType.CLINIC  # Reclassify as clinic
                    beds_str = tags.get("beds", "0")
                    if beds_str.isdigit() and int(beds_str) >= 20:
                        return ServiceType.HOSPITAL  # Real hospital
                    # Otherwise reject
                    return None
            
            # ADDITIONAL REJECT: "Clinic" in name = it's a clinic, not hospital
            CLINIC_NAME_PATTERNS = [
                "clinic", "polyclinic",
            ]
            
            for pattern in CLINIC_NAME_PATTERNS:
                if pattern in name and "hospital" not in name:
                    # It explicitly says "clinic" — classify as clinic
                    if tags.get("emergency") == "yes":
                        return ServiceType.CLINIC
                    return None  # Non-emergency clinic — reject
            
            # Now apply the original hospital criteria
            HOSPITAL_NAME_INDICATORS = [
                "hospital", "hospitals",
                "medical center", "medical centre",
                "medical college",
                "general hospital",
                "trauma center", "trauma centre",
                "institute of medical",
                "institute of health",
                "super specialit",
                "multi specialit",
                "multispecialit",
            ]
            
            has_hospital_name = any(ind in name for ind in HOSPITAL_NAME_INDICATORS)
            has_emergency_tag = tags.get("emergency") == "yes"
            has_healthcare_hospital = healthcare == "hospital"
            beds_str = tags.get("beds", "0")
            has_significant_beds = beds_str.isdigit() and int(beds_str) >= 10
            
            if has_hospital_name or has_emergency_tag or has_healthcare_hospital or has_significant_beds:
                return ServiceType.HOSPITAL
            
            if has_emergency_tag:
                return ServiceType.CLINIC
            
            return None
        
        # ─── CLINICS: Only if explicitly emergency-capable ───
        if amenity == "clinic":
            if tags.get("emergency") == "yes":
                return ServiceType.CLINIC
            return None  # Reject non-emergency clinics
        
        if healthcare == "clinic":
            if tags.get("emergency") == "yes":
                return ServiceType.CLINIC
            return None
        
        # ─── POLICE ───
        if amenity == "police":
            return ServiceType.POLICE
        
        # ─── FIRE STATIONS ───
        if amenity == "fire_station" or emergency == "fire_station":
            return ServiceType.FIRE_STATION
        
        # ─── AMBULANCE STATIONS ───
        if emergency == "ambulance_station":
            return ServiceType.AMBULANCE
        
        # ─── 24/7 PHARMACIES ───
        if amenity == "pharmacy" and "24/7" in opening_hours:
            return ServiceType.PHARMACY_24H
        
        # ─── EMERGENCY SHELTERS ───
        if amenity == "shelter" and shelter_type == "emergency":
            return ServiceType.SHELTER
        
        if emergency in ("disaster_response", "assembly_point"):
            return ServiceType.SHELTER
        
        # ─── HELIPADS ───
        if tags.get("aeroway") == "helipad" and emergency == "yes":
            return ServiceType.HELIPAD
        
        # ─── REJECT: Generic emergency=yes without specific context ───
        return None
    
    def _build_service(
        self, element: Dict, service_type: ServiceType
    ) -> Optional[EmergencyService]:
        """Build and validate a single emergency service."""
        tags = element.get("tags", {})
        
        # ─── 1. Validate Name (REQUIRED) ───
        name = self._extract_name(tags)
        if not name:
            raise _ValidationError("no_name")
        
        # ─── 2. Validate Location (REQUIRED) ───
        lat, lon = self._extract_coordinates(element)
        if lat is None or lon is None:
            raise _ValidationError("no_location")
        
        # ─── 3. Bounds Check ───
        if not self._is_in_bbox(lat, lon):
            raise _ValidationError("outside_bbox")
        
        # ─── 4. Build Service Type-Specific Service ───
        priority = self.SERVICE_PRIORITY.get(service_type, ServicePriority.MEDIUM)
        
        # ─── 5. Extract Rich Metadata ───
        phone = self._extract_phone(tags)
        opening_hours = tags.get("opening_hours", "").strip()
        is_24_7 = self._is_24_7(opening_hours)
        
        # ─── 6. Address Components ───
        address_data = self._extract_address(tags)
        
        # ─── 7. Capabilities ───
        has_emergency = self._has_emergency_service(tags, service_type)
        speciality = tags.get("healthcare:speciality", "").strip() or None
        operator = tags.get("operator", "").strip() or None
        operator_type = tags.get("operator:type", "").strip() or None
        
        # ─── 8. Other Metadata ───
        wheelchair = tags.get("wheelchair", "").strip() or None
        
        beds = None
        if tags.get("beds", "").isdigit():
            beds = int(tags["beds"])
        
        # ─── 9. Compute Confidence ───
        confidence_score, confidence_level, validation_flags = (
            self._compute_confidence(
                name=name,
                phone=phone,
                opening_hours=opening_hours,
                address_data=address_data,
                has_emergency=has_emergency,
                speciality=speciality,
                operator=operator,
                tags=tags,
            )
        )
        
        # ─── 10. Reject Low-Confidence Services ───
        if confidence_level == ConfidenceLevel.LOW:
            raise _ValidationError("low_confidence")
        
        # ─── 11. Build Service ───
        osm_id = f"{element.get('type')}/{element.get('id', 'unknown')}"
        
        return EmergencyService(
            osm_id=osm_id,
            osm_type=element.get("type"),
            name=name,
            service_type=service_type,
            priority=priority,
            latitude=lat,
            longitude=lon,
            phone=phone,
            phone_emergency=tags.get("phone:emergency"),
            website=tags.get("website") or tags.get("url"),
            email=tags.get("email"),
            address_full=address_data.get("full"),
            address_street=address_data.get("street"),
            address_housenumber=address_data.get("housenumber"),
            address_city=address_data.get("city"),
            address_postcode=address_data.get("postcode"),
            address_state=address_data.get("state"),
            opening_hours=opening_hours or None,
            is_24_7=is_24_7,
            has_emergency=has_emergency,
            speciality=speciality,
            operator=operator,
            operator_type=operator_type,
            wheelchair=wheelchair,
            beds=beds,
            confidence_level=confidence_level,
            confidence_score=confidence_score,
            validation_flags=validation_flags,
            city_code=self.city_code,
        )
    
    # ─── Extraction Helpers ───
    
    def _extract_name(self, tags: Dict) -> Optional[str]:
        """Extract the best available name."""
        for key in ["name:en", "name", "official_name", "alt_name"]:
            value = tags.get(key, "").strip()
            if value and len(value) >= 2:
                return value[:200]
        return None
    
    def _extract_coordinates(self, element: Dict) -> Tuple[Optional[float], Optional[float]]:
        """Extract lat/lon from OSM element."""
        if element.get("type") == "node":
            return element.get("lat"), element.get("lon")
        
        # For ways/relations, use the centroid from bounds or geometry
        if "center" in element:
            return element["center"].get("lat"), element["center"].get("lon")
        
        if "geometry" in element and element["geometry"]:
            geom = element["geometry"]
            if isinstance(geom, list) and len(geom) > 0:
                avg_lat = sum(g["lat"] for g in geom) / len(geom)
                avg_lon = sum(g["lon"] for g in geom) / len(geom)
                return avg_lat, avg_lon
        
        if "bounds" in element:
            b = element["bounds"]
            return (
                (b["minlat"] + b["maxlat"]) / 2,
                (b["minlon"] + b["maxlon"]) / 2,
            )
        
        return None, None
    
    def _is_in_bbox(self, lat: float, lon: float) -> bool:
        """Check if point is within city bbox."""
        return (
            self.city_bbox["south"] <= lat <= self.city_bbox["north"] and
            self.city_bbox["west"] <= lon <= self.city_bbox["east"]
        )
    
    def _extract_phone(self, tags: Dict) -> Optional[str]:
        """Extract and validate phone number."""
        for key in ["phone", "contact:phone", "telephone"]:
            phone = tags.get(key, "").strip()
            if phone:
                # Take first phone if multiple (separated by ;)
                phone = phone.split(";")[0].strip()
                # Basic validation for Indian numbers
                cleaned = re.sub(r'[\s\-()]', '', phone)
                if len(cleaned) >= 10:
                    return phone[:50]
        return None
    
    def _is_24_7(self, opening_hours: str) -> bool:
        """Check if facility is 24/7."""
        if not opening_hours:
            return False
        oh = opening_hours.lower().strip()
        return any(pattern in oh for pattern in ["24/7", "00:00-24:00", "00:00-23:59"])
    
    def _extract_address(self, tags: Dict) -> Dict[str, str]:
        """Extract address components."""
        address = {
            "street": tags.get("addr:street", "").strip() or None,
            "housenumber": tags.get("addr:housenumber", "").strip() or None,
            "city": tags.get("addr:city", "").strip() or "Hyderabad",
            "postcode": tags.get("addr:postcode", "").strip() or None,
            "state": tags.get("addr:state", "").strip() or "Telangana",
        }
        
        # Build full address string
        parts = []
        if address["housenumber"]:
            parts.append(address["housenumber"])
        if address["street"]:
            parts.append(address["street"])
        if address["city"]:
            parts.append(address["city"])
        if address["state"]:
            parts.append(address["state"])
        if address["postcode"]:
            parts.append(address["postcode"])
        
        address["full"] = ", ".join(parts) if parts else None
        return address
    
    def _has_emergency_service(self, tags: Dict, service_type: ServiceType) -> bool:
        """Determine if facility has emergency capability."""
        if service_type in (
            ServiceType.HOSPITAL,
            ServiceType.FIRE_STATION,
            ServiceType.POLICE,
            ServiceType.AMBULANCE,
        ):
            return True
        
        if tags.get("emergency") == "yes":
            return True
        
        if tags.get("healthcare:speciality") == "emergency":
            return True
        
        return False
    
    def _compute_confidence(
        self,
        name: str,
        phone: Optional[str],
        opening_hours: str,
        address_data: Dict,
        has_emergency: bool,
        speciality: Optional[str],
        operator: Optional[str],
        tags: Dict,
    ) -> Tuple[float, ConfidenceLevel, List[str]]:
        """
        Compute confidence score for a service.
        
        Higher confidence = more verified data.
        """
        score = 0.0
        flags = []
        
        # Base score for existence
        score += 0.3
        flags.append("has_basic_info")
        
        # Name quality
        if len(name) >= 5 and not name.startswith("?"):
            score += 0.10
            flags.append("good_name")
        
        # Phone present (critical for emergencies)
        if phone:
            score += 0.20
            flags.append("has_phone")
        
        # Address present
        if address_data.get("street"):
            score += 0.10
            flags.append("has_address")
        
        # Operating hours
        if opening_hours:
            score += 0.10
            flags.append("has_hours")
        
        # Emergency capability explicitly tagged
        if has_emergency:
            score += 0.10
            flags.append("emergency_capable")
        
        # Speciality info
        if speciality:
            score += 0.05
            flags.append("has_speciality")
        
        # Operator info
        if operator:
            score += 0.05
            flags.append("has_operator")
        
        # Cap at 1.0
        score = min(score, 1.0)
        
        # Determine confidence level
        if score >= 0.70:
            level = ConfidenceLevel.VERIFIED
        elif score >= 0.55:
            level = ConfidenceLevel.HIGH
        elif score >= 0.45:
            level = ConfidenceLevel.MEDIUM
        else:
            level = ConfidenceLevel.LOW
        
        return score, level, flags
    
    def _deduplicate(
        self, services: List[EmergencyService]
    ) -> List[EmergencyService]:
        """Remove duplicate services (same name within 50m)."""
        if not services:
            return services
        
        # Sort by confidence (keep highest)
        services = sorted(services, key=lambda s: s.confidence_score, reverse=True)
        
        keep = []
        rejected_indices = set()
        
        for i, svc_a in enumerate(services):
            if i in rejected_indices:
                continue
            
            keep.append(svc_a)
            
            for j in range(i + 1, len(services)):
                if j in rejected_indices:
                    continue
                
                svc_b = services[j]
                
                # Different service type → not duplicates
                if svc_a.service_type != svc_b.service_type:
                    continue
                
                # Distance check
                dist_km = haversine_km(
                    svc_a.latitude, svc_a.longitude,
                    svc_b.latitude, svc_b.longitude,
                )
                
                if dist_km > self.DEDUP_DISTANCE_KM:
                    continue
                
                # Name similarity check
                if self._names_similar(svc_a.name, svc_b.name):
                    rejected_indices.add(j)
                    self.stats["rejected_duplicate"] = (
                        self.stats.get("rejected_duplicate", 0) + 1
                    )
        
        return keep
    
    def _names_similar(self, name1: str, name2: str) -> bool:
        """Check if two service names are similar enough to be duplicates."""
        n1 = re.sub(r'[^a-z0-9]', '', name1.lower())
        n2 = re.sub(r'[^a-z0-9]', '', name2.lower())
        
        if not n1 or not n2:
            return False
        
        # Exact match after normalization
        if n1 == n2:
            return True
        
        # One contained in other (e.g., "Apollo" vs "Apollo Hospital")
        if n1 in n2 or n2 in n1:
            shorter = min(len(n1), len(n2))
            longer = max(len(n1), len(n2))
            if shorter / longer >= 0.7:
                return True
        
        return False
    
    def _log_stats(self):
        """Log processing statistics."""
        self.logger.info("=" * 60)
        self.logger.info("EMERGENCY SERVICES PROCESSING STATS")
        self.logger.info("=" * 60)
        self.logger.info(f"Total processed:              {self.stats['total_processed']}")
        self.logger.info(f"Validated:                    {self.stats['validated']}")
        self.logger.info(f"Rejected (no classification): {self.stats['rejected_no_classification']}")
        self.logger.info(f"Rejected (no name):           {self.stats['rejected_no_name']}")
        self.logger.info(f"Rejected (no location):       {self.stats['rejected_no_location']}")
        self.logger.info(f"Rejected (outside bbox):      {self.stats['rejected_outside_bbox']}")
        self.logger.info(f"Rejected (duplicates):        {self.stats.get('rejected_duplicate', 0)}")
        self.logger.info(f"Rejected (low confidence):    {self.stats.get('rejected_low_confidence', 0)}")
        
        self.logger.info("\nBy confidence:")
        for level in [4, 3, 2, 1]:
            label = ["", "Low", "Medium", "High", "Verified"][level]
            count = self.stats["by_confidence"].get(level, 0)
            self.logger.info(f"  Level {level} ({label:8s}): {count}")
        
        self.logger.info("\nBy type:")
        for type_name, count in sorted(self.stats["by_type"].items()):
            self.logger.info(f"  {type_name:20s}: {count}")


class _ValidationError(Exception):
    """Internal exception for tracking validation failures."""
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)