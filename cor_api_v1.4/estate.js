/*
corApi Estate API
Version: 1.0.0

Public surface (stable):
  corApi.getEstateValue(characterId, opts?)

Definition (v1):
  estate = cash + totalPropertyValue
*/

({
  checkType: "monthly",
  checkAndAct() {
    if (!window.daapi) return;

    window.corApi = window.corApi || {};
    if (window.corApi.getEstateValue) return; // already initialized

    // Requires property.js to have loaded first
    if (!window.corApi.getTotalPropertyValue || !window.corApi._getCharSnapshot) return;

    /**
     * corApi.getEstateValue(characterId, opts?)
     *
     * Computes:
     *   estate = liquid cash + total property value
     *
     * @returns {{
     *   cash: number,
     *   property: number,
     *   total: number,
     *   propertyBreakdown: object,
     *   source: "summed" | "no-character"
     * }}
     */
    window.corApi.getEstateValue = function (characterId, opts = {}) {
      const char = window.corApi._getCharSnapshot(characterId);

      if (!char) {
        return { cash: 0, property: 0, total: 0, propertyBreakdown: {}, source: "no-character" };
      }

      const cash =
        typeof char.cash === "number" && Number.isFinite(char.cash)
          ? char.cash
          : 0;

      const propertyResult = window.corApi.getTotalPropertyValue(characterId, opts);

      return {
        cash,
        property: propertyResult.total,
        total: cash + propertyResult.total,
        propertyBreakdown: propertyResult.breakdown,
        source: "summed",
      };
    };
  },
})
