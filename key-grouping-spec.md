# Keyify: group results by key (spec for Claude Code)

## Problem
Searching "2015 Toyota Camry" returns one result per supplier product (OEM, aftermarket, ILCO, Strattec, refurbished...). Same key, many rows. Too cluttered, and a customer can't tell which listings are the same key.

## Rule
**One result card per physical key.** Supplier and quality variants are folded into that card, not shown as separate results.

### 1. Group key
Rows belong to the same key when they share the same `groupKey`:

1. `keyType` + `fcc`   (when fcc is present)
2. else `keyType` + `chip` + key code from the title, e.g. TOY44D, H92, B110   (transponder, emergency and metal keys have no FCC ID)

Normalize before comparing: uppercase, strip spaces and dashes. Never match on a blank value alone.
OEM and aftermarket listings of the same key often have different `partNumber` values, so do NOT include `partNumber` in the group key. Different part numbers inside one group are expected and get listed on the card (see section 3).
Never merge keys that differ in keyType or FCC, even if the titles look alike.

### 2. Card layout (keep it small)
```
4-Button Smart Key                          <- keyType
FCC: HYQ14FBC    Chip: H                    <- key identity
Fits: 2018-2023 Camry                       <- the vehicle that was searched
Options: OEM · Aftermarket · Refurbished    <- small badges, one per supply type in the group
Part #: 89904-06220 · 8990H-06220  +3 more  <- all part numbers (section 3)
Also fits (6)  [expand]                     <- collapsed (section 4)
```

### 3. Part numbers (so customers can still find their number)
- Collect every unique `partNumber`, `fcc` and `sku` from all rows merged into the card.
- Show them as visible text under "Part #". Show the first 2, then "+N more" that expands on click.
- **Search must match any of them.** If someone types 89070-06790, they land on the card holding it, even when a different part number is the one displayed. Normalize (strip dashes and spaces, ignore case) when matching.
- Keep these as visible page text, not hidden metadata, so they are also searchable on Google.

### 4. "Also fits" (collapsed by default)
- Every other make, model and year range that shares the same group key, grouped by make, e.g. `Avalon 2013-2018 · Corolla 2014-2020 · RAV4 2013-2018`.
- Show the count in the label. Expand on click.
- Exclude the vehicle already searched.

### 5. Ordering and limits
- Sort cards: exact year match first, then smart key, flip key / remote head key, keyless remote, transponder, emergency / metal key.
- Show about 5 cards, then a "Show more" button.

### 6. Do NOT
- Do not make one card per quality tier.
- Do not show prices, stock or shop buttons on the card (Keyify is a compatibility checker).
- Do not claim certainty. Fitment data comes from a supplier and is unverified (`verified=false`). Add a small note such as "Confirm with your VIN before buying."

## Data notes
- Source files: `keyify-<brand>-keys-by-model.csv`, one row per sku + model + year range. Columns: make, model, yearFrom, yearTo, keyType, chip, fcc, partNumber, programming, verified, sku, supply, notes, source.
- `supply` holds OEM / Aftermarket / Refurbished / ILCO / JMA / STRATTEC. Use it for the Options badges.
- `partNumber` was parsed from product titles and is blank for about 25% of SKUs (64 of 241 Toyota). Cards built from those listings will show fewer part numbers. That is a data gap, not a bug.
- Some Subaru and GM key SKUs list other makes (Chevrolet, GMC, Scion, Toyota) in their fitment. They appear as rows under those makes, so those cards will show on both sides.
- Model names are not fully consistent across suppliers (for example "XV", "XV Crosstrek" and "Crosstrek"). Add a small alias map if the same car shows up under two names.

## Test before trusting it
1. Search 2015 Toyota Camry. Expect about 3 to 5 cards, not 20.
2. Search a part number that is NOT the one displayed on a card (for example the aftermarket one). It should still find that card.
3. Open "Also fits" on a smart key card. The list should not repeat the Camry.
