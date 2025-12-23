# cor_api (Citizens of Rome: Dynasty Ascendant)

A lightweight expanded modding API for **Citizens of Rome: Dynasty Ascendant**.

This mod exposes a stable global object, `window.corApi`, which provides helpers for reading and valuing character property data and modeling inheritance logic (including custom share overrides stored as character flags).

**Current status:** v1.0.0 (Property + Estate + Inheritance)

---

## Installation

Create the following folder structure:

```
mods/
  cor_api/
    monthly.js
    property.js
    estate.js
    inheritance.js
    README.md
```

### monthly.js (load order)

`monthly.js` must load the modules **in this order**:

```js
[
  "/cor_api/property",
  "/cor_api/estate",
  "/cor_api/inheritance"
]
```

> Do not include `.js` in the paths.

---

## Important: File format requirements (Dynasty Ascendant loader)

Each module file is evaluated by the game's mod loader as a **single expression** that returns an event object.

To avoid parser errors like `Unexpected token ';'`:

- Each file should end with **`})`** (no trailing semicolon).
- Do not add extra statements after the exported event object.

Example module ending:

```js
({
  checkType: "monthly",
  checkAndAct() {
    // ...
  },
})
```

---

## When does the API load?

This API initializes during the **monthly event loop**.  
After the game advances at least one day, `window.corApi` will be available.

---

## Quick Start (Console)

```js
// Confirm loaded
window.corApi

const id = window.daapi.getState().current.id;

// Property value (single type)
corApi.getProperty(id, "farmland");

// Total property value (sum of all propertyDetails)
corApi.getTotalPropertyValue(id).total;

// Estate = cash + property value
corApi.getEstateValue(id).total;

// Eligible heirs (designated + children, ordered)
corApi.getEligibleHeirs(id, { includeCharacters: true });

// Vanilla equal split (unless stored will shares exist)
corApi.getInheritanceShares(id);

// Preview inheritance (with UI rounding)
corApi.previewInheritance(id, { includeHeirCharacters: true, ui: { round: 2 } });
```

---

## Module Overview

### property.js

Defines:

- `corApi.BASE_PROPERTY_PRICES`
- `corApi.getPropertyValue(characterId, propertyKey, opts?)`
- `corApi.getTotalPropertyValue(characterId, opts?)`
- `corApi.getProperty(...)` (alias for `getPropertyValue`)
- `corApi.setPropertyPrice(propertyKey, unitPrice)`
- `corApi.setPropertyPrices(priceMap)`

Also defines internal shared helpers (not stable public API):

- `corApi._getCharSnapshot(characterId)`
- `corApi._getAllCharactersFromState(state)`

---

### estate.js

Defines:

- `corApi.getEstateValue(characterId, opts?)`

Estate v1 definition:

> **estate = cash + total property value**

---

### inheritance.js

Defines:

- `corApi.getEligibleHeirs(characterId, opts?)`
- `corApi.getInheritanceShares(deceasedId)`
- `corApi.previewInheritance(deceasedId, opts?)`
- `corApi.setInheritanceShares(deceasedId, shares, opts?)`
- `corApi.getStoredInheritanceShares(deceasedId)`
- `corApi.clearInheritanceShares(deceasedId)`

#### v1 Heir rules

- Includes **designated heir** (if alive)
- Includes **living children** by scanning `state.characters` and matching:
  - `fatherId`, `motherId`, or `parentId`

Heirs are **deduped** and ordered with designated heir first.

#### v1 Shares rules

- If stored shares exist (a “will”), they are used.
- Otherwise, shares fall back to **vanilla equal split** among eligible heirs.

Stored shares are saved to a **character flag**:

- `inheritanceShares_v1`

Your DAAPI build provides:

- `daapi.getCharacterFlag`
- `daapi.setCharacterFlag`

No `clear` method exists, so clearing works by overwriting the flag with an empty shares map.

#### v1 Preview rules

- Cash is split by share.
- Property is split by **total property value** by share.
- Discrete allocation (e.g., which specific animals go to whom) is not implemented yet.

---

## API Reference

### Property

#### `corApi.getPropertyValue(characterId, propertyKey, opts?)`
Returns value info for one property type.

**opts**
- `multiplier` (number, default `1`)
- `prices` (object, default `corApi.BASE_PROPERTY_PRICES`)

**returns**
```js
{
  propertyKey,
  units,
  unitPrice,
  multiplier,
  value,
  source
}
```

#### `corApi.getTotalPropertyValue(characterId, opts?)`
Sums all properties in `propertyDetails`.

**returns**
```js
{ total, breakdown, source }
```

---

### Estate

#### `corApi.getEstateValue(characterId, opts?)`
Returns the estate value (cash + property).

**returns**
```js
{
  cash,
  property,
  total,
  propertyBreakdown,
  source
}
```

---

### Inheritance

#### `corApi.getEligibleHeirs(characterId, opts?)`

**opts**
- `includeCharacters` (bool, default `false`)
- `includeDesignated` (bool, default `true`)
- `includeChildren` (bool, default `true`)

**returns**
```js
{
  designatedHeirId,
  heirIds,
  heirs?, // only if includeCharacters
  source
}
```

#### `corApi.getInheritanceShares(deceasedId)`

**returns**
```js
{
  shares: { [heirId]: number }, // fractions of 1
  heirs: string[],
  sharePerHeir: number,
  source
}
```

#### `corApi.previewInheritance(deceasedId, opts?)`

**opts**
- `includeHeirCharacters` (bool, default `false`)
- `ui` (object)
  - `round` (number) e.g. 2
  - `floor` (bool)

**returns**
```js
{
  deceasedId,
  estate,
  shares,
  perHeir: [
    { heirId, share, cash, propertyValue, totalValue, heir? }
  ],
  source
}
```

#### `corApi.setInheritanceShares(deceasedId, shares, opts?)`

Accepts:
- map form: `{ [heirId]: share }`
- array form: `[{ heirId, share }]`

Shares are normalized to sum to 1.

**opts**
- `restrictToEligible` (bool, default `true`)

#### `corApi.clearInheritanceShares(deceasedId)`
Clears stored will overrides by overwriting `inheritanceShares_v1` with empty shares.

---

## Known Property Keys

Observed in `propertyDetails`:

- farmland
- vineyards
- orchards
- prime_farmland
- cattle
- pig
- sheep
- goat

(Additional keys may exist depending on game version.)

---

## Roadmap

Planned additions:

- `applyInheritanceCashOnly(deceasedId)` (idempotent; distributes cash by shares)
- discrete property allocation (animals / land units) rules
- wills UI integration (sliders + validation)
- additional heir rules (spouse/siblings/extended family) and dynasty law variants
