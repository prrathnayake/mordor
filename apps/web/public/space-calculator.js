/**
 * SpaceCalculator — Coordinate conversion engine for Cesium globe
 * Supports multiple input formats: lat/lon, Cartesian3, Cartographic, screen pixels, MGRS, UTM
 */
class SpaceCalculator {
  constructor(viewer) {
    this.viewer = viewer;
    this.geocodeCache = new Map();
  }

  /* ── Core: anything → Cartesian3 ── */
  toCartesian3(input) {
    if (!input) return null;

    // Already Cartesian3
    if (input instanceof Cesium.Cartesian3) return input;

    // Cartographic (radians)
    if (input instanceof Cesium.Cartographic) {
      return Cesium.Cartesian3.fromRadians(input.longitude, input.latitude, input.height ?? 0);
    }

    // { lat, lon, height }
    if (typeof input.lat === "number" && typeof input.lon === "number") {
      return Cesium.Cartesian3.fromDegrees(input.lon, input.lat, input.height ?? 0);
    }

    // { latitude, longitude, altitude }
    if (typeof input.latitude === "number" && typeof input.longitude === "number") {
      return Cesium.Cartesian3.fromDegrees(input.longitude, input.latitude, input.altitude ?? 0);
    }

    // Screen pixels → globe pick
    if (typeof input.x === "number" && typeof input.y === "number") {
      const cartesian = this.viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(input.x, input.y),
        this.viewer.scene.globe.ellipsoid,
      );
      return cartesian || null;
    }

    // MGRS string
    if (typeof input.mgrs === "string") {
      return this.mgrsToCartesian3(input.mgrs);
    }

    // UTM object
    if (typeof input.utm === "object" && input.utm) {
      return this.utmToCartesian3(input.utm);
    }

    // Address string (cached geocode)
    if (typeof input.address === "string") {
      return this.addressToCartesian3(input.address);
    }

    // Entity-relative offset
    if (input.entityId && typeof input.offset === "object") {
      return this.entityOffsetToCartesian3(input.entityId, input.offset);
    }

    // Array [lon, lat, height]
    if (Array.isArray(input) && input.length >= 2) {
      return Cesium.Cartesian3.fromDegrees(input[0], input[1], input[2] ?? 0);
    }

    console.warn("[SpaceCalculator] Unknown input format:", input);
    return null;
  }

  /* ── Cartesian3 → other formats ── */
  toLatLon(cartesian3) {
    const c = this.viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian3);
    if (!c) return null;
    return {
      lat: Cesium.Math.toDegrees(c.latitude),
      lon: Cesium.Math.toDegrees(c.longitude),
      height: c.height,
    };
  }

  toCartographic(cartesian3) {
    return this.viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian3);
  }

  /* ── Screen coordinates ── */
  toScreen(cartesian3OrInput) {
    const cartesian = this.toCartesian3(cartesian3OrInput);
    if (!cartesian) return null;

    const scene = this.viewer.scene;
    const result = new Cesium.Cartesian2();

    // Try wgs84ToWindowCoordinates first, fallback to worldToWindowCoordinates
    const transform =
      Cesium.SceneTransforms.wgs84ToWindowCoordinates ||
      Cesium.SceneTransforms.worldToWindowCoordinates;

    if (!transform) return null;

    const pos = transform(scene, cartesian, result);
    return pos ? { x: pos.x, y: pos.y } : null;
  }

  fromScreen(x, y) {
    return this.toCartesian3({ x, y });
  }

  /* ── Batch conversion ── */
  batchToCartesian3(inputs) {
    return inputs.map((input) => this.toCartesian3(input));
  }

  batchToScreen(inputs) {
    return inputs.map((input) => this.toScreen(input)).filter(Boolean);
  }

  /* ── Visibility check ── */
  isVisible(cartesian3OrInput) {
    const cartesian = this.toCartesian3(cartesian3OrInput);
    if (!cartesian) return false;

    const scene = this.viewer.scene;
    const camera = scene.camera;

    // Check if point is inside camera frustum
    const frustum = camera.frustum;
    if (!frustum?.computeCullingVolume) return false;

    const cullingVolume = frustum.computeCullingVolume(
      camera.position,
      camera.direction,
      camera.up,
    );
    const intersection = cullingVolume.computeVisibility(new Cesium.BoundingSphere(cartesian, 1));
    if (intersection === Cesium.Intersect.OUTSIDE) return false;

    // Also check if occluded by globe
    if (scene.globe) {
      const occluder = new Cesium.EllipsoidalOccluder(scene.globe.ellipsoid, camera.position);
      if (!occluder.isPointVisible(cartesian)) return false;
    }

    return true;
  }

  /* ── Distance / bearing utilities ── */
  distanceMeters(a, b) {
    const ca = this.toCartesian3(a);
    const cb = this.toCartesian3(b);
    if (!ca || !cb) return null;
    return Cesium.Cartesian3.distance(ca, cb);
  }

  bearingDegrees(from, to) {
    const a = this.toLatLon(from);
    const b = this.toLatLon(to);
    if (!a || !b) return null;

    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
  }

  /* ── MGRS conversion (simplified) ── */
  mgrsToCartesian3(mgrsString) {
    // Simplified MGRS → lat/lon conversion
    // For full accuracy, use a dedicated MGRS library
    const parsed = this.parseMGRS(mgrsString);
    if (!parsed) return null;
    return Cesium.Cartesian3.fromDegrees(parsed.lon, parsed.lat, parsed.height ?? 0);
  }

  parseMGRS(mgrs) {
    // Basic MGRS parser: "14RPU1234567890" or "14R PU 12345 67890"
    const cleaned = mgrs.replace(/\s/g, "").toUpperCase();
    const match = cleaned.match(/^(\d{1,2})([C-X])([A-Z]{2})(\d{0,10})$/);
    if (!match) return null;

    const zone = parseInt(match[1], 10);
    const band = match[2];
    const sqId = match[3];
    const num = match[4];

    if (!num || num.length % 2 !== 0) return null;

    const half = num.length / 2;
    const eastingStr = num.slice(0, half).padEnd(5, "0");
    const northingStr = num.slice(half).padEnd(5, "0");

    // Convert UTM zone/band to approximate lat/lon
    const lonZone = zone;
    const latBand = band.charCodeAt(0) - "C".charCodeAt(0);
    const approxLat = latBand * 8 - 80 + 4; // rough center of band
    const approxLon = (lonZone - 1) * 6 - 180 + 3;

    // Simple approximation: add easting/northing as meters offset
    const easting = parseInt(eastingStr, 10);
    const northing = parseInt(northingStr, 10);

    // 100km square IDs: first char = column (A-H, J-N, P-Z), second = row (A-V)
    const colChar = sqId.charCodeAt(0);
    const rowChar = sqId.charCodeAt(1);

    // Approximate offset within 100km square
    const colOffset =
      ((colChar >= "J".charCodeAt(0) ? colChar - 1 : colChar) - "A".charCodeAt(0)) % 8;
    const rowOffset = rowChar - "A".charCodeAt(0);

    const offsetX = easting + colOffset * 100000;
    const offsetY = northing + rowOffset * 100000;

    // Convert to lat/lon (very rough)
    const metersPerDegLat = 111320;
    const metersPerDegLon = 111320 * Math.cos((approxLat * Math.PI) / 180);

    return {
      lat: approxLat + offsetY / metersPerDegLat,
      lon: approxLon + offsetX / metersPerDegLon,
      height: 0,
    };
  }

  /* ── UTM conversion (simplified) ── */
  utmToCartesian3(utm) {
    if (!utm || typeof utm.easting !== "number" || typeof utm.northing !== "number") {
      return null;
    }

    // Simplified UTM → lat/lon using Cesium's built-in projection
    const projection = new Cesium.WebMercatorProjection(this.viewer.scene.globe.ellipsoid);
    const x = utm.easting;
    const y = utm.northing;
    const cartographic = projection.unproject(new Cesium.Cartesian3(x, y, 0));

    return Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      utm.height ?? 0,
    );
  }

  /* ── Address geocoding (cached, async) ── */
  async addressToCartesian3Async(address) {
    if (this.geocodeCache.has(address)) {
      const cached = this.geocodeCache.get(address);
      return Cesium.Cartesian3.fromDegrees(cached.lon, cached.lat, cached.height ?? 0);
    }

    // Use Nominatim (OpenStreetMap) geocoding
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      );
      if (!response.ok) return null;

      const results = await response.json();
      if (!results.length) return null;

      const result = results[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      this.geocodeCache.set(address, { lat, lon, height: 0 });
      return Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    } catch (error) {
      console.warn("[SpaceCalculator] Geocoding failed:", error);
      return null;
    }
  }

  addressToCartesian3(address) {
    // Return cached if available, otherwise null (use async version for new addresses)
    if (this.geocodeCache.has(address)) {
      const cached = this.geocodeCache.get(address);
      return Cesium.Cartesian3.fromDegrees(cached.lon, cached.lat, cached.height ?? 0);
    }
    console.warn(
      "[SpaceCalculator] Address not in cache, use addressToCartesian3Async():",
      address,
    );
    return null;
  }

  /* ── Entity-relative offset ── */
  entityOffsetToCartesian3(entityId, offset) {
    const entity = this.viewer.entities.getById(entityId);
    if (!entity?.position) return null;

    const base = entity.position.getValue(this.viewer.clock.currentTime);
    if (!base) return null;

    const offsetCartesian = new Cesium.Cartesian3(offset.x ?? 0, offset.y ?? 0, offset.z ?? 0);
    return Cesium.Cartesian3.add(base, offsetCartesian, new Cesium.Cartesian3());
  }

  /* ── Viewport bounds ── */
  getViewportBounds() {
    const rect = this.viewer.camera.computeViewRectangle();
    if (!rect) return null;
    return {
      west: Cesium.Math.toDegrees(rect.west),
      south: Cesium.Math.toDegrees(rect.south),
      east: Cesium.Math.toDegrees(rect.east),
      north: Cesium.Math.toDegrees(rect.north),
    };
  }

  /* ── Cleanup ── */
  destroy() {
    this.geocodeCache.clear();
    this.viewer = null;
  }
}

/* ── Export for module systems ── */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SpaceCalculator };
}
