const fs = require("fs");
const path = require("path");

const DATASET_PATH = path.join(
  __dirname,
  "../data/places.json"
);

const raw = fs.readFileSync(DATASET_PATH, "utf-8");
const data = JSON.parse(raw);

const places = data.places || [];

const errors = [];
const warnings = [];

console.log(`\nTotal Places: ${places.length}\n`);

const REQUIRED_FIELDS = [
  "id",
  "name",
  "category",
  "subcategory",
  "coordinates",
  "rating",
  "recommendation_tier",
  "walking_intensity",
  "must_visit"
];

const VALID_TIERS = ["S", "A", "B", "C"];

const VALID_WALKING = [
  "low",
  "moderate",
  "high"
];

const placeIds = new Set(
  places.map(p => p.id)
);

for (const place of places) {

  // -------------------------
  // REQUIRED FIELDS
  // -------------------------

  for (const field of REQUIRED_FIELDS) {
    if (
      place[field] === undefined ||
      place[field] === null
    ) {
      errors.push(
        `[${place.id}] missing field -> ${field}`
      );
    }
  }

  // -------------------------
  // ID
  // -------------------------

  if (
    !place.id ||
    typeof place.id !== "string"
  ) {
    errors.push(
      `[${place.id}] invalid id`
    );
  }

  // -------------------------
  // COORDINATES
  // -------------------------

  if (!place.coordinates) {
    errors.push(
      `[${place.id}] missing coordinates`
    );
  } else {
    const { lat, lon } = place.coordinates;

    if (
      typeof lat !== "number" ||
      lat < -90 ||
      lat > 90
    ) {
      errors.push(
        `[${place.id}] invalid latitude`
      );
    }

    if (
      typeof lon !== "number" ||
      lon < -180 ||
      lon > 180
    ) {
      errors.push(
        `[${place.id}] invalid longitude`
      );
    }
  }

  // -------------------------
  // RATING
  // -------------------------

  if (
    typeof place.rating !== "number" ||
    place.rating < 0 ||
    place.rating > 5
  ) {
    errors.push(
      `[${place.id}] invalid rating`
    );
  }

  // -------------------------
  // RECOMMENDATION TIER
  // -------------------------

  if (
    !VALID_TIERS.includes(
      place.recommendation_tier
    )
  ) {
    errors.push(
      `[${place.id}] invalid recommendation tier`
    );
  }

  // -------------------------
  // WALKING INTENSITY
  // -------------------------

  if (
    !VALID_WALKING.includes(
      place.walking_intensity
    )
  ) {
    errors.push(
      `[${place.id}] invalid walking intensity`
    );
  }

  // -------------------------
  // DURATION
  // -------------------------

  if (
    typeof place.recommended_duration_hours !==
      "number" ||
    place.recommended_duration_hours <= 0
  ) {
    errors.push(
      `[${place.id}] invalid duration`
    );
  }

  // -------------------------
  // NEARBY IDS
  // -------------------------

  if (
    Array.isArray(place.nearby_place_ids)
  ) {
    for (const nearby of place.nearby_place_ids) {
      if (!placeIds.has(nearby)) {
        errors.push(
          `[${place.id}] invalid nearby_place_id -> ${nearby}`
        );
      }
    }
  }

  // -------------------------
  // PAIR WELL WITH
  // -------------------------

  if (
    Array.isArray(place.pair_well_with)
  ) {
    for (const pair of place.pair_well_with) {
      if (!placeIds.has(pair)) {
        errors.push(
          `[${place.id}] invalid pair_well_with -> ${pair}`
        );
      }
    }
  }

  // -------------------------
  // WARNINGS
  // -------------------------

  if (
    !place.nearby_place_ids ||
    place.nearby_place_ids.length === 0
  ) {
    warnings.push(
      `[${place.id}] has no nearby places`
    );
  }

  if (
    place.rating >= 4.7 &&
    place.recommendation_tier !== "S"
  ) {
    warnings.push(
      `[${place.id}] rating suggests S tier`
    );
  }

  if (
    place.must_visit === true &&
    place.recommendation_tier === "C"
  ) {
    warnings.push(
      `[${place.id}] must_visit but tier C`
    );
  }
}

console.log(
  `Errors: ${errors.length}`
);
console.log(
  `Warnings: ${warnings.length}\n`
);

if (errors.length) {
  console.log(
    "===== ERRORS ====="
  );
  errors.forEach(e => console.log(e));
}

if (warnings.length) {
  console.log(
    "\n===== WARNINGS ====="
  );
  warnings.forEach(w => console.log(w));
}

if (
  errors.length === 0 &&
  warnings.length === 0
) {
  console.log(
    "Dataset validation passed."
  );
}