/*
corApi Animal Fertility API
Version: 1.0.0

Public surface (stable):
  corApi.getAnimalFertilityFactor(characterId, opts?)

Definition (v1):
  Returns a multiplier (default: 1)
*/

({
  checkType: "monthly",
  checkAndAct() {
    if (!window.daapi) return;

    window.corApi = window.corApi || {};
    if (window.corApi.getAnimalFertilityFactor) return; // already initialized

    // Requires property.js first (for _getCharSnapshot consistency)
    if (!window.corApi._getCharSnapshot) return;

    /**
     * corApi.getAnimalFertilityFactor(characterId, opts?)
     *
     * v1 behavior:
     * - Always returns 1
     * - Exists so mods can safely call it
     */
    window.corApi.getAnimalFertilityFactor = function (characterId, opts = {}) {
        const char = window.corApi._getCharSnapshot(characterId);
        if (!char) return 1;

        let factor = 1;

        const farmland = char.propertyDetails?.farmland || 0;

        window.corApi.ANIMAL_FERTILITY_TIERS = window.corApi.ANIMAL_FERTILITY_TIERS || [
            { min: 50, mult: 2.2 },
            { min: 35, mult: 1.8 },
            { min: 20, mult: 1.5 },
            { min: 10, mult: 1.25 },
            { min: 5,  mult: 1.1 },
        ];

        // Tiered scaling based on farmland count
        let tierMult = 1;
        for (const tier of window.corApi.ANIMAL_FERTILITY_TIERS) {
        if (farmland >= tier.min) { tierMult = tier.mult; break; }
        }
        factor *= tierMult;

        // SAFETY CAP: prevent runaway fertility
        const MAX_FERTILITY_MULTIPLIER = 5;
        factor = Math.min(factor, MAX_FERTILITY_MULTIPLIER);

        return factor;
        };

  },
})
