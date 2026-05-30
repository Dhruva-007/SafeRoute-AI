/**
 * Geometry utilities for geofencing.
 * 
 * All functions designed for performance — called frequently
 * during GPS tracking.
 */

/**
 * Haversine formula for distance between two lat/lon points.
 * Returns distance in METERS.
 */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if a point is inside a circle.
 * Used for circle-type geofences (transit stops, junctions).
 */
export function isInsideCircle(userLat, userLon, centerLat, centerLon, radiusMeters) {
  return haversineMeters(userLat, userLon, centerLat, centerLon) <= radiusMeters;
}

/**
 * Winding Number algorithm for point-in-polygon.
 * 
 * More accurate than ray casting:
 * - Handles concave polygons correctly
 * - Handles vertex edge cases robustly
 * - Returns winding number (0 = outside, non-zero = inside)
 * 
 * @param userLat, userLon - point to test
 * @param vertices - array of {lat, lon} or [lon, lat] coordinate pairs
 */
export function isInsidePolygon(userLat, userLon, vertices) {
  // Normalize vertex format
  const points = vertices.map(v => {
    if (Array.isArray(v)) return { lat: v[1], lon: v[0] };
    return v;
  });
  
  let wn = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const yi = points[i].lat;
    const yj = points[j].lat;
    
    if (yi <= userLat) {
      if (yj > userLat) {
        // Upward crossing
        if (isLeft(points[i], points[j], userLat, userLon) > 0) {
          wn++;
        }
      }
    } else {
      if (yj <= userLat) {
        // Downward crossing
        if (isLeft(points[i], points[j], userLat, userLon) < 0) {
          wn--;
        }
      }
    }
  }
  
  return wn !== 0;
}

/**
 * Cross product: tests if point is left of, on, or right of line.
 * Returns: > 0 (left), 0 (on), < 0 (right)
 */
function isLeft(p1, p2, testLat, testLon) {
  return ((p2.lon - p1.lon) * (testLat - p1.lat) -
          (testLon - p1.lon) * (p2.lat - p1.lat));
}

/**
 * Check if a point is inside a GeoJSON geometry.
 * Handles Polygon and MultiPolygon types.
 */
export function isInsideGeoJSON(userLat, userLon, geometry) {
  if (!geometry) return false;
  
  if (geometry.type === 'Polygon') {
    return isInsidePolygonRings(userLat, userLon, geometry.coordinates);
  }
  
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      if (isInsidePolygonRings(userLat, userLon, polygon)) {
        return true;
      }
    }
    return false;
  }
  
  return false;
}

/**
 * Check polygon with potential holes (rings).
 * First ring is outer, subsequent rings are holes.
 */
function isInsidePolygonRings(userLat, userLon, rings) {
  if (rings.length === 0) return false;
  
  // Must be inside outer ring
  const outer = rings[0];
  if (!isInsidePolygon(userLat, userLon, outer)) {
    return false;
  }
  
  // Must NOT be inside any hole
  for (let i = 1; i < rings.length; i++) {
    if (isInsidePolygon(userLat, userLon, rings[i])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Quick bounding box check (used as pre-filter).
 */
export function isInsideBbox(lat, lon, bbox) {
  return lat >= bbox.min_lat && lat <= bbox.max_lat &&
         lon >= bbox.min_lon && lon <= bbox.max_lon;
}