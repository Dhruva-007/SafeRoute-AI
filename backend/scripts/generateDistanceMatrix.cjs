const fs = require("fs");
const path = require("path");

const placesFile = path.join(__dirname, "..", "data", "places.json");
const outputFile = path.join(
  __dirname,
  "..",
  "data",
  "distance_matrix.json"
);

const data = JSON.parse(fs.readFileSync(placesFile, "utf8"));

const places = data.places || [];

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const matrix = {};

for (const source of places) {
  matrix[source.id] = {};

  for (const target of places) {
    if (source.id === target.id) continue;

    const distance = haversine(
      source.coordinates.lat,
      source.coordinates.lon,
      target.coordinates.lat,
      target.coordinates.lon
    );

    matrix[source.id][target.id] =
      Math.round(distance * 100) / 100;
  }
}

fs.writeFileSync(
  outputFile,
  JSON.stringify(matrix, null, 2)
);

console.log(
  `Distance matrix generated for ${places.length} places`
);
console.log(`Saved to: ${outputFile}`);