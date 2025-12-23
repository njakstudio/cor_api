/*
corApi Property API
Version: 1.0.0

Public surface (stable):
  corApi.getProperty(characterId, propertyKey, opts?)
  corApi.getPropertyValue(characterId, propertyKey, opts?)
  corApi.getTotalPropertyValue(characterId, opts?)

  corApi.setPropertyPrice(propertyKey, unitPrice)
  corApi.setPropertyPrices(priceMap)
  corApi.BASE_PROPERTY_PRICES

Notes:
- propertyDetails is a map of propertyKey -> units (from daapi.getState()).
- Prices are not present in getState(); this mod provides a canonical price table.
*/

({
  checkType: "monthly",
  checkAndAct() {
    if (!window.daapi) return;

    window.corApi = window.corApi || {};
    if (window.corApi.getPropertyValue) return; // already initialized

    const daapi = window.daapi;

    // ---------------------------------------------------------------------------
    // PRICE REGISTRY
    // ---------------------------------------------------------------------------

    window.corApi.BASE_PROPERTY_PRICES = window.corApi.BASE_PROPERTY_PRICES || {
      farmland: 250,
      vineyards: 360,
      orchards: 420,
      prime_farmland: 2700,
      cattle: 300,
      pig: 120,
      sheep: 180,
      goat: 150,
    };

    // ---------------------------------------------------------------------------
    // INTERNAL HELPERS (shared; not part of public API)
    // ---------------------------------------------------------------------------

    /**
     * Resolve a character snapshot.
     * - If it's the "current" player, state.current already has the fields we need.
     * - Otherwise fall back to daapi.getCharacter (if available).
     */
    window.corApi._getCharSnapshot = window.corApi._getCharSnapshot || function (characterId) {
      const state = daapi.getState();
      if (state?.current?.id === characterId) return state.current;
      if (daapi.getCharacter) return daapi.getCharacter({ characterId });
      return null;
    };

    /**
     * Return an array of all characters from game state.
     * In your save/state schema, characters are stored as a map: state.characters
     */
    window.corApi._getAllCharactersFromState =
      window.corApi._getAllCharactersFromState ||
      function (state) {
        const map = state?.characters;
        if (map && typeof map === "object") return Object.values(map).filter(Boolean);
        return [];
      };

    // ---------------------------------------------------------------------------
    // PROPERTY API
    // ---------------------------------------------------------------------------

    window.corApi.getPropertyValue = function (characterId, propertyKey, opts = {}) {
      const prices = opts.prices || window.corApi.BASE_PROPERTY_PRICES;
      const multiplier =
        typeof opts.multiplier === "number" && Number.isFinite(opts.multiplier)
          ? opts.multiplier
          : 1;

      const char = window.corApi._getCharSnapshot(characterId);
      if (!char) {
        return { propertyKey, units: 0, unitPrice: 0, multiplier, value: 0, source: "no-character" };
      }

      const details = char.propertyDetails;
      if (!details || typeof details !== "object") {
        return { propertyKey, units: 0, unitPrice: 0, multiplier, value: 0, source: "no-properties" };
      }

      const units = details[propertyKey] ?? 0;
      const unitPrice = prices[propertyKey] ?? 0;

      return {
        propertyKey,
        units,
        unitPrice,
        multiplier,
        value: units * unitPrice * multiplier,
        source: unitPrice ? "base-price-table" : "unknown-property",
      };
    };

    window.corApi.getTotalPropertyValue = function (characterId, opts = {}) {
      const char = window.corApi._getCharSnapshot(characterId);
      const details = char?.propertyDetails;

      if (!details || typeof details !== "object") {
        return { total: 0, breakdown: {}, source: "no-properties" };
      }

      let total = 0;
      const breakdown = {};

      for (const key of Object.keys(details)) {
        const info = window.corApi.getPropertyValue(characterId, key, opts);
        breakdown[key] = info;
        total += info.value;
      }

      return { total, breakdown, source: "summed" };
    };

    window.corApi.setPropertyPrice = function (propertyKey, unitPrice) {
      window.corApi.BASE_PROPERTY_PRICES[propertyKey] = unitPrice;
    };

    window.corApi.setPropertyPrices = function (priceMap) {
      Object.assign(window.corApi.BASE_PROPERTY_PRICES, priceMap);
    };

    /**
     * corApi.getProperty(...) is the shorter ergonomic alias.
     * Same signature, same return shape.
     */
    window.corApi.getProperty = window.corApi.getPropertyValue;
  },
})
