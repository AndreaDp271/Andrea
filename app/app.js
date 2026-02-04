const map = L.map("map", {
  zoomControl: true,
}).setView([41.9028, 12.4964], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

map.createPane("parking");
map.getPane("parking").style.zIndex = 400;

map.createPane("parkingSpace");
map.getPane("parkingSpace").style.zIndex = 500;

const parkingLayer = L.geoJSON(null, { pane: "parking" }).addTo(map);
const parkingSpaceLayer = L.layerGroup([], { pane: "parkingSpace" }).addTo(map);

const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");
const locateButton = document.getElementById("locate-button");

const parkingSpaceStyles = {
  disabled: { emoji: "🚫", color: "#b91c1c" },
  customers: { emoji: "🛍️", color: "#f59e0b" },
  motorcycle: { emoji: "🏍️", color: "#ef4444" },
  bicycle: { emoji: "🚲", color: "#10b981" },
  bus: { emoji: "🚌", color: "#3b82f6" },
  taxi: { emoji: "🚕", color: "#facc15" },
  electric: { emoji: "⚡", color: "#22c55e" },
  charging: { emoji: "🔌", color: "#22c55e" },
  car_sharing: { emoji: "🚗", color: "#6366f1" },
  carpool: { emoji: "👥", color: "#6366f1" },
  resident: { emoji: "🏠", color: "#8b5cf6" },
  loading: { emoji: "📦", color: "#f97316" },
  delivery: { emoji: "📦", color: "#f97316" },
  coach: { emoji: "🚌", color: "#0ea5e9" },
};

const paymentLabels = {
  yes: "A pagamento",
  no: "Gratis",
};

function normalize(text) {
  return text ? text.toString() : "";
}

function isDiscParking(tags) {
  return ["yes", "disc"].includes(normalize(tags["parking:disc"])) ||
    normalize(tags["disc"]) === "yes" ||
    normalize(tags["maxstay"]).includes("disc");
}

function isPaidParking(tags) {
  const fee = normalize(tags.fee);
  const feeConditional = normalize(tags["fee:conditional"]);
  const charge = normalize(tags.charge);
  const chargeConditional = normalize(tags["charge:conditional"]);
  const payment = normalize(tags.payment);

  if (fee === "yes" || payment === "yes") {
    return true;
  }
  if (fee === "no" || payment === "no") {
    return false;
  }
  if (feeConditional || chargeConditional || charge) {
    return true;
  }
  return false;
}

function parkingColor(tags) {
  if (isDiscParking(tags)) {
    return "#9b59b6";
  }
  if (isPaidParking(tags)) {
    return "#3498db";
  }
  return "#2ecc71";
}

function parkingTypeLabel(tags) {
  if (isDiscParking(tags)) {
    return "Parcheggio con disco orario";
  }
  if (isPaidParking(tags)) {
    return "Parcheggio a pagamento";
  }
  return "Parcheggio gratis";
}

function buildPopup(tags, latLng) {
  const listItems = [];
  listItems.push(`<li><strong>Tipo:</strong> ${parkingTypeLabel(tags)}</li>`);

  const access = normalize(tags.access);
  if (access) {
    listItems.push(`<li><strong>Accesso:</strong> ${access}</li>`);
  }

  const openingHours = normalize(tags.opening_hours);
  if (openingHours) {
    listItems.push(`<li><strong>Orari:</strong> ${openingHours}</li>`);
  }

  const maxstay = normalize(tags.maxstay);
  if (maxstay) {
    listItems.push(`<li><strong>Limite di sosta:</strong> ${maxstay}</li>`);
  }

  const feeConditional = normalize(tags["fee:conditional"]);
  if (feeConditional) {
    listItems.push(`<li><strong>Pagamento (condizionale):</strong> ${feeConditional}</li>`);
  }

  const charge = normalize(tags.charge);
  if (charge) {
    listItems.push(`<li><strong>Costo:</strong> ${charge}</li>`);
  }

  const chargeConditional = normalize(tags["charge:conditional"]);
  if (chargeConditional) {
    listItems.push(`<li><strong>Costo (condizionale):</strong> ${chargeConditional}</li>`);
  }

  const note = normalize(tags.note);
  if (note) {
    listItems.push(`<li><strong>Nota:</strong> ${note}</li>`);
  }

  const destination = `${latLng.lat},${latLng.lng}`;
  const navLink = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;

  return `
    <div class="popup-title">${normalize(tags.name) || "Parcheggio OSM"}</div>
    <ul class="popup-list">${listItems.join("")}</ul>
    <div class="popup-actions">
      <a href="${navLink}" target="_blank" rel="noopener">Apri navigatore</a>
    </div>
  `;
}

function buildSpacePopup(tags, latLng) {
  const listItems = [];
  const type = normalize(tags.parking_space) || "speciale";
  listItems.push(`<li><strong>Categoria:</strong> ${type}</li>`);

  const access = normalize(tags.access);
  if (access) {
    listItems.push(`<li><strong>Accesso:</strong> ${access}</li>`);
  }

  const destination = `${latLng.lat},${latLng.lng}`;
  const navLink = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;

  return `
    <div class="popup-title">Parking space</div>
    <ul class="popup-list">${listItems.join("")}</ul>
    <div class="popup-actions">
      <a href="${navLink}" target="_blank" rel="noopener">Apri navigatore</a>
    </div>
  `;
}

function computeCenter(geometry, fallback) {
  if (!geometry || geometry.length === 0) {
    return fallback;
  }
  const latSum = geometry.reduce((sum, point) => sum + point.lat, 0);
  const lonSum = geometry.reduce((sum, point) => sum + point.lon, 0);
  return { lat: latSum / geometry.length, lng: lonSum / geometry.length };
}

function clearLayers() {
  parkingLayer.clearLayers();
  parkingSpaceLayer.clearLayers();
}

function addParkingFeature(element) {
  if (!element.geometry && element.type === "node") {
    return;
  }

  const geometry = element.geometry
    ? element.geometry.map((point) => [point.lat, point.lon])
    : null;

  const latLng = element.center
    ? { lat: element.center.lat, lng: element.center.lon }
    : computeCenter(element.geometry, map.getCenter());

  const tags = element.tags || {};
  const color = parkingColor(tags);

  const feature = geometry
    ? L.polygon(geometry, {
        color,
        fillColor: color,
        fillOpacity: 0.35,
        weight: 2,
        pane: "parking",
      })
    : L.circleMarker([latLng.lat, latLng.lng], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.6,
        pane: "parking",
      });

  feature.bindPopup(buildPopup(tags, latLng));
  feature.on("click", () => {
    feature.openPopup();
  });

  parkingLayer.addLayer(feature);
}

function addParkingSpaceFeature(element) {
  const tags = element.tags || {};
  const type = normalize(tags.parking_space);
  if (!type || type === "normal") {
    return;
  }

  const style = parkingSpaceStyles[type] || { emoji: "🅿️", color: "#f39c12" };

  const latLng = element.center
    ? [element.center.lat, element.center.lon]
    : [element.lat, element.lon];

  const icon = L.divIcon({
    className: "parking-space-icon",
    html: `<span>${style.emoji}</span>`,
    iconSize: [32, 32],
  });

  const marker = L.marker(latLng, {
    icon,
    pane: "parkingSpace",
  });

  marker.getElement = function getElement() {
    return this._icon;
  };

  marker.on("add", () => {
    const elementNode = marker.getElement();
    if (elementNode) {
      elementNode.style.background = style.color;
    }
  });

  marker.bindPopup(buildSpacePopup(tags, { lat: latLng[0], lng: latLng[1] }));
  marker.on("click", () => marker.openPopup());

  parkingSpaceLayer.addLayer(marker);
}

async function fetchParking(bbox) {
  const query = `
    [out:json][timeout:25];
    (
      way["amenity"="parking"](${bbox});
      relation["amenity"="parking"](${bbox});
      node["amenity"="parking"](${bbox});
      way["amenity"="parking_space"]["parking_space"!~"^(normal)?$"](${bbox});
      relation["amenity"="parking_space"]["parking_space"!~"^(normal)?$"](${bbox});
      node["amenity"="parking_space"]["parking_space"!~"^(normal)?$"](${bbox});
    );
    out center geom;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });

  if (!response.ok) {
    throw new Error("Errore durante il download dei parcheggi.");
  }

  return response.json();
}

async function loadParking() {
  const bounds = map.getBounds();
  const bbox = [
    bounds.getSouth(),
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
  ].join(",");

  clearLayers();

  try {
    const data = await fetchParking(bbox);
    data.elements.forEach((element) => {
      if (element.tags?.amenity === "parking") {
        addParkingFeature(element);
      } else if (element.tags?.amenity === "parking_space") {
        addParkingSpaceFeature(element);
      }
    });
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

async function geocode(query) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`,
  );
  if (!response.ok) {
    throw new Error("Ricerca non disponibile.");
  }
  return response.json();
}

searchButton.addEventListener("click", async () => {
  const query = searchInput.value.trim();
  if (!query) {
    return;
  }
  try {
    const results = await geocode(query);
    if (!results.length) {
      alert("Nessun risultato.");
      return;
    }
    const { lat, lon } = results[0];
    map.setView([parseFloat(lat), parseFloat(lon)], 15);
    loadParking();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

locateButton.addEventListener("click", () => {
  map.locate({ setView: true, maxZoom: 16 });
});

map.on("locationerror", () => {
  alert("Impossibile ottenere la posizione.");
});

map.on("moveend", () => {
  loadParking();
});

loadParking();
