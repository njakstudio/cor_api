/*
corApi Inheritance API
Version: 1.0.0

Public surface (stable):
  corApi.getEligibleHeirs(characterId, opts?)
  corApi.getInheritanceShares(deceasedId)
  corApi.previewInheritance(deceasedId, opts?)
  corApi.setInheritanceShares(deceasedId, shares, opts?)
  corApi.getStoredInheritanceShares(deceasedId)
  corApi.clearInheritanceShares(deceasedId)

Notes:
- v1 uses equal-split unless stored shares exist.
- previewInheritance splits property by TOTAL VALUE only (no discrete item allocation yet).
*/

({
  checkType: "monthly",
  checkAndAct() {
    if (!window.daapi) return;

    window.corApi = window.corApi || {};
    if (window.corApi.getEligibleHeirs) return; // already initialized

    const daapi = window.daapi;

    // Requires property.js + estate.js first
    if (!window.corApi._getCharSnapshot || !window.corApi._getAllCharactersFromState) return;
    if (!window.corApi.getEstateValue) return;

    // ---------------------------------------------------------------------------
    // INTERNAL HELPERS (inheritance module)
    // ---------------------------------------------------------------------------

    function roundTo(n, places) {
      const p = Math.pow(10, places);
      return Math.round(n * p) / p;
    }

    /**
     * Apply UI formatting rules (rounding / flooring) to numeric values.
     * This should ONLY be used in preview/UI paths, never core logic.
     */
    function formatValue(n, ui) {
      if (!ui) return n;
      if (ui.floor) return Math.floor(n);
      if (typeof ui.round === "number") return roundTo(n, ui.round);
      return n;
    }

    function normalizeSharesMap(map) {
      const cleaned = {};
      let sum = 0;

      for (const [k, v] of Object.entries(map || {})) {
        const n = Number(v);
        if (!k || !Number.isFinite(n) || n <= 0) continue;
        cleaned[k] = n;
        sum += n;
      }

      if (sum <= 0) return { normalized: {}, sum: 0 };

      for (const k of Object.keys(cleaned)) cleaned[k] = cleaned[k] / sum;

      return { normalized: cleaned, sum };
    }

    function coerceSharesToMap(shares) {
      // map form
      if (shares && typeof shares === "object" && !Array.isArray(shares)) return shares;

      // array form
      if (Array.isArray(shares)) {
        const out = {};
        for (const row of shares) {
          if (!row) continue;
          const id = row.heirId ?? row.id;
          const val = row.share ?? row.value;
          if (typeof id === "string") out[id] = val;
        }
        return out;
      }

      return {};
    }

    function getFlagApi() {
      // Your build exposes exactly these:
      // getCharacterFlag, setCharacterFlag, getGlobalFlag, setGlobalFlag
      return {
        getChar: daapi.getCharacterFlag ? (args) => daapi.getCharacterFlag(args) : null,
        setChar: daapi.setCharacterFlag ? (args) => daapi.setCharacterFlag(args) : null,
      };
    }

    // ---------------------------------------------------------------------------
    // HEIRS
    // ---------------------------------------------------------------------------

    /**
     * corApi.getEligibleHeirs(characterId, opts?)
     *
     * v1 Behavior:
     * - Collect eligible heirs from multiple sources:
     *   1) designated heir (if alive)
     *   2) living children (derived by scanning state.characters)
     *
     * Returns ALL found heirs (deduped), with designated heir first if present.
     */
    window.corApi.getEligibleHeirs = function (characterId, opts = {}) {
      const includeCharacters = !!opts.includeCharacters;
      const includeDesignated = opts.includeDesignated !== false;
      const includeChildren = opts.includeChildren !== false;

      const state = daapi.getState();
      const deceased = window.corApi._getCharSnapshot(characterId);

      const result = {
        designatedHeirId: null,
        heirIds: [],
        heirs: includeCharacters ? [] : undefined,
        source: "",
      };

      if (!deceased) {
        result.source = "no-character";
        return result;
      }

      const collectedIds = new Set();

      // 1) designated heir (not exclusive)
      const designatedId = deceased.flagDesignatedHeirId;
      if (includeDesignated && typeof designatedId === "string" && designatedId.length > 0 && daapi.getCharacter) {
        const des = daapi.getCharacter({ characterId: designatedId });
        result.designatedHeirId = designatedId;
        if (des && !des.isDead) collectedIds.add(designatedId);
      }

      // 2) derived children via state.characters scan
      let foundChildren = false;
      if (includeChildren) {
        const allChars = window.corApi._getAllCharactersFromState(state);

        const livingChildren = allChars
          .filter((c) => c && (c.fatherId === characterId || c.motherId === characterId || c.parentId === characterId))
          .filter((c) => !c.isDead && typeof c.id === "string" && c.id.length > 0);

        if (livingChildren.length > 0) {
          foundChildren = true;
          livingChildren.sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
          for (const c of livingChildren) collectedIds.add(c.id);
        }
      }

      // Order: designated first, then rest
      let heirIds = Array.from(collectedIds);
      if (result.designatedHeirId && collectedIds.has(result.designatedHeirId)) {
        heirIds = [result.designatedHeirId, ...heirIds.filter((id) => id !== result.designatedHeirId)];
      }

      result.heirIds = heirIds;

      if (includeCharacters && daapi.getCharacter) {
        result.heirs = heirIds.map((id) => daapi.getCharacter({ characterId: id })).filter(Boolean);
      }

      const parts = [];
      if (result.designatedHeirId && collectedIds.has(result.designatedHeirId)) parts.push("designated");
      if (foundChildren) parts.push("children");
      result.source = parts.length ? `collected:${parts.join("+")}` : "none-found-v1";

      return result;
    };

    // ---------------------------------------------------------------------------
    // SHARES
    // ---------------------------------------------------------------------------

    window.corApi.getStoredInheritanceShares = function (deceasedId) {
      const flagApi = getFlagApi();
      if (!flagApi.getChar) return null;

      const res = flagApi.getChar({ characterId: deceasedId, flag: "inheritanceShares_v1" });
      const payload = res?.data ?? res;

      if (!payload || payload.v !== 1 || !payload.shares) return null;

      // Treat empty shares as "cleared"
      if (Object.keys(payload.shares).length === 0) return null;

      return { shares: payload.shares, source: "stored:inheritanceShares_v1" };
    };

    /**
     * corApi.getInheritanceShares(deceasedId)
     *
     * v1:
     * - If stored will shares exist, use them
     * - Else vanilla equal split among eligible heirs
     */
    window.corApi.getInheritanceShares = function (deceasedId) {
      const stored = window.corApi.getStoredInheritanceShares(deceasedId);

      if (stored) {
        return {
          shares: stored.shares,
          heirs: Object.keys(stored.shares),
          sharePerHeir: 0,
          source: stored.source,
        };
      }

      const heirsResult = window.corApi.getEligibleHeirs(deceasedId);
      const heirIds = heirsResult.heirIds || [];

      if (!heirIds.length) {
        return { shares: {}, heirs: [], sharePerHeir: 0, source: "no-heirs" };
      }

      const sharePerHeir = 1 / heirIds.length;
      const shares = {};
      for (const id of heirIds) shares[id] = sharePerHeir;

      return { shares, heirs: heirIds.slice(), sharePerHeir, source: "equal-split" };
    };

    // ---------------------------------------------------------------------------
    // PREVIEW
    // ---------------------------------------------------------------------------

    /**
     * corApi.previewInheritance(deceasedId, opts?)
     *
     * NOTE (v1):
     * - Inheritance preview splits property by total VALUE only
     * - Discrete items (e.g. individual animals) are not allocated yet
     *
     * opts:
     * - includeHeirCharacters: include full heir character objects
     * - ui: { round?: number, floor?: boolean } for display formatting
     */
    window.corApi.previewInheritance = function (deceasedId, opts = {}) {
      const includeHeirCharacters = !!opts.includeHeirCharacters;

      const estate = window.corApi.getEstateValue(deceasedId, opts);
      const sharesInfo = window.corApi.getInheritanceShares(deceasedId);
      const heirsInfo = window.corApi.getEligibleHeirs(deceasedId, { includeCharacters: includeHeirCharacters });

      const heirIds = sharesInfo.heirs || [];
      const perHeir = [];

      for (const heirId of heirIds) {
        const share = sharesInfo.shares[heirId] ?? 0;

        const rawCash = estate.cash * share;
        const rawProperty = estate.property * share;

        const cash = formatValue(rawCash, opts.ui);
        const propertyValue = formatValue(rawProperty, opts.ui);
        const totalValue = formatValue(cash + propertyValue, opts.ui);

        perHeir.push({
          heirId,
          share,
          cash,
          propertyValue,
          totalValue,
          heir: includeHeirCharacters
            ? (heirsInfo.heirs || []).find((h) => h?.id === heirId)
            : undefined,
        });
      }

      const source = `estate:${estate.source}|shares:${sharesInfo.source}|heirs:${heirsInfo.source}`;

      return {
        deceasedId,
        estate,
        shares: sharesInfo,
        perHeir,
        source,
      };
    };

    // ---------------------------------------------------------------------------
    // PERSISTENCE
    // ---------------------------------------------------------------------------

    window.corApi.setInheritanceShares = function (deceasedId, shares, opts = {}) {
      const restrictToEligible = opts.restrictToEligible !== false;

      const flagApi = getFlagApi();
      if (!flagApi.setChar) throw new Error("corApi.setInheritanceShares: setCharacterFlag not available");

      const map = coerceSharesToMap(shares);

      // Optionally restrict to eligible heirs
      let filtered = map;
      if (restrictToEligible) {
        const eligible = window.corApi.getEligibleHeirs(deceasedId);
        const eligibleSet = new Set(eligible.heirIds || []);
        filtered = {};
        for (const [heirId, val] of Object.entries(map)) {
          if (eligibleSet.has(heirId)) filtered[heirId] = val;
        }
      }

      const { normalized } = normalizeSharesMap(filtered);

      flagApi.setChar({
        characterId: deceasedId,
        flag: "inheritanceShares_v1",
        data: { v: 1, setAt: Date.now(), shares: normalized },
      });

      return { deceasedId, shares: normalized, source: "stored:inheritanceShares_v1" };
    };

    window.corApi.clearInheritanceShares = function (deceasedId) {
      const flagApi = getFlagApi();
      if (!flagApi.setChar) {
        return { deceasedId, cleared: false, source: "no-setCharacterFlag" };
      }

      // No clear() exists in your daapi build; overwrite with empty
      flagApi.setChar({
        characterId: deceasedId,
        flag: "inheritanceShares_v1",
        data: { v: 1, clearedAt: Date.now(), shares: {} },
      });

      return { deceasedId, cleared: true, source: "overwritten-empty:inheritanceShares_v1" };
    };
  },
})
