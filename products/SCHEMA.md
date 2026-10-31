# `products/<code>.json`

One file per product. The filename is the product's permanent code and becomes
part of a printed URL (`/p/<code>`), so choose it once and never change it.
Make it opaque: `4471`, not `panadol-extra-500mg`. Brand names change,
strengths change, products get relicensed. The printed code names a slot; what
fills the slot is your decision later.

Every piece of reader-facing text is a `LocalizedText`:

```json
{ "ar": "النص بالعربية", "en": "The English text" }
```

## Top level

```json
{
  "data":   { ... },       // everything about this product
  "plates": { "<ingredient-id>": "../../assets/plates/<file>.webp" },
  "flags":  { "restrictions": true, "timeToEffect": true }
}
```

`flags` gate optional sections. `timeToEffect` shows the "when to expect a
difference" box; `restrictions` shows dietary restrictions on non-active
ingredients. Leave a flag off rather than inventing content for it.

## `data.product`

| Field | Type | Notes |
|---|---|---|
| `name` | LocalizedText | Brand name as printed on the box |
| `category` | LocalizedText | Optional. One short line under the name on the product directory, e.g. "Joint-health food supplement" |
| `cardImage` | string | Optional. Pack photo for the product directory, relative to `src/assets/` (e.g. `products/<code>.webp`). Square-ish works best. Without it the card shows the name's first letter. Use a real photo of the actual pack, never a generated mock-up. |
| `straplineClaimId` | string | id of the claim used as the page strapline |
| `capsulesPerPack` | number | |
| `dose` | LocalizedText | Full sentence, e.g. "One capsule daily, with or without food. Adults only." |
| `registration.authority` | LocalizedText | e.g. National Food Safety Authority |
| `registration.number` | string | e.g. `5332/2023` |
| `manufacturedBy` | LocalizedText | |
| `manufacturedFor` | LocalizedText | |
| `countryOfManufacture` | LocalizedText | |
| `telephone` | string | |
| `website` | string | |
| `storage` | LocalizedText | |
| `disclaimer` | LocalizedText | The footer disclaimer |

## `data.paths`

The reader picks a door on arrival; the door reorders the sections to answer
that reader's question first. Content is identical between paths — only the
order changes.

```json
{
  "id": "pain",
  "door": { "ar": "...", "en": "My knees hurt now" },
  "register": "calm-clinical",
  "sectionOrder": ["evidence", "how-to-take", "safety",
                   "ingredients", "what-it-is", "contact"]
}
```

Valid section ids: `what-it-is`, `how-to-take`, `ingredients`, `evidence`,
`safety`, `contact`.

Keep every path's `sectionOrder` covering the same set of sections. The build
renders the longest path into the no-JavaScript fallback and warns if some
section would be left out of it.

## `data.ingredients[]`

| Field | Notes |
|---|---|
| `id` | Must match a key in `plates` |
| `name` | LocalizedText |
| `amount.value`, `amount.unit` | Per the label |
| `amount.provenance.kind` | Where the number came from, e.g. `label` |
| `standardisation` | `declared` false means the rest is absent |
| `source` | LocalizedText — what it is extracted from |
| `allergen` | LocalizedText, or omit |
| `comparison.trialDose` | LocalizedText — what trials actually used |
| `comparison.verdict` | `matches` \| `low-end-of-effective-range` \| `below-trial-dose` \| `not-comparable` |
| `comparison.citationIds` | ids from `data.citations` |
| `story.headline`, `story.body` | The tap-to-reveal fact |
| `mechanism` | LocalizedText — how it is thought to work |
| `readerRank` | Display order, 1 first |
| `readerRankReason` | Free text, for whoever edits this next |

`comparison.verdict` is the honest part of this leaflet. Setting it to
`matches` when the dose is below trial levels is the one edit that turns this
page into marketing.

## `data.claims[]`

```json
{
  "id": "ucii-time-to-effect",
  "statement": { "ar": "...", "en": "..." },
  "supportedBy": "citation-id",
  "qualifications": [ { "ar": "...", "en": "..." } ],
  "paths": ["pain"]
}
```

`qualifications` are what the claim does *not* establish — small sample,
industry funding, short duration. They render directly beneath the claim. Do
not leave this empty to make a claim look stronger.

## `data.citations[]`

```json
{
  "id": "lugo-2016",
  "authors": "...", "year": 2016, "journal": "...",
  "participants": 52, "durationDays": 90,
  "url": "https://...",
  "fundedByIngredientManufacturer": "yes"
}
```

## `data.warnings[]`

```json
{ "id": "...", "text": { "ar": "...", "en": "..." }, "origin": "pack" }
```

`origin` records where the warning comes from — `pack` means it is printed on
the carton and must not be edited without regulatory sign-off.

## `data.interactionChecks[]`

The yes/no safety questions.

```json
{
  "id": "...",
  "question": { "ar": "...", "en": "Do you take a blood thinner?" },
  "ifYes":    { "ar": "...", "en": "Do not start before asking your doctor..." },
  "severity": "do-not-take"
}
```

`severity`: `do-not-take` | `ask-doctor`.

## `data.nonActiveIngredients[]`

```json
{
  "name": { "ar": "...", "en": "Gelatin" },
  "eNumber": null,
  "purpose": { "ar": "...", "en": "Capsule shell" },
  "restrictions": [ { "ar": "...", "en": "Not suitable for vegetarians" } ]
}
```

## A note on registered medicines

This schema describes a food supplement: ingredients, claims, citations,
interaction checks. A registered medicine needs different fields entirely —
indications, posology, contraindications, adverse reactions, and the
EDA-approved leaflet text, which is not something to paraphrase.

When the first medicine arrives, add a `"type": "medicine"` field and a second
set of section builders in `src/assets/leaflet.js` rather than forcing drug
information into supplement-shaped fields.
