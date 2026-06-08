const fs = require("fs");

const data = JSON.parse(
  fs.readFileSync(
    "data/places.json",
    "utf8"
  )
);

console.log(
  "Total Places:",
  data.places.length
);

for (const p of data.places) {
  console.log(p.id);
}