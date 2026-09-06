# nextfloor

eye candy mostly. useless mainly.

A generated isometric pixel-art building that grows one floor at a time. Type a
theme, and an AI pipeline draws a floor in that theme and stacks it on the tower.

The experiment: can independently generated floor tiles hold a rigid enough
visual contract that dozens of them still read as one continuous building?

## How a floor is made

1. **Theme Interpreter** (Claude) turns a theme into a structured floor spec.
2. **Art Director** (`src/lib/building/prompt.ts`, plain code) composes that spec
   with the immutable Building Style Guide into one image prompt.
3. **Image generation** (fal, Nano Banana) draws the tile from that prompt. Later
   floors are generated as an *edit* of the reference tile, which holds the shell
   far better than conditioning on it. FLUX was tried first and reads the
   structural prompt as a brief for an architectural render — it returns clean,
   empty, photoreal CAD cutaways.
4. **Validation** checks the tile against the contract and retries once.
5. A refusal or a second failure becomes a **dead floor** — a burnt-out storey
   rendered in CSS, with the reason on it.

The prompts live in `src/lib/prompts/` as markdown, not in code, because they are
what gets tuned every session:

- `iso-instructions.md` — the seed tile, which has nothing to match.
- `edit-instructions.md` — every later floor, generated as an edit of the
  reference tile. The reference carries the contract, so this prompt's job is to
  forbid changing it.
- `structure-{floor,roof,basement}.md` — the per-kind structural language.

`GET /api/prompt?mode=seed|edit` renders exactly what would be sent, so the
prompt can be read without spending a generation. `src/lib/building/styleGuide.ts`
holds the tile geometry. Changing any of it invalidates the visual compatibility
of every floor generated before the change.

## Starting tiles

`docs/reference/building-spec-sheet.png` is the drawn contract: 2048 x 512, 4:1,
identical shell on every floor, regular floors open top and bottom, roof closed
at the top, basement closed at the bottom.

`public/top-floor.png`, `public/middle-floor.png` and `public/bottom-floor.png`
are the static building: roof, reference floor, basement. Seeding imports them
instead of generating, and every generated floor is an edit of the middle one.
They must share one frame — the import refuses tiles that disagree.

Tiles are transparent PNGs composited over the black page. If a generator bakes
the transparency checkerboard in as opaque grey squares, restore real alpha with:

```bash
node scripts/dealpha.mjs public/bottom-floor.png
```

`TILE.pitchRatio` in `src/lib/building/styleGuide.ts` is the vertical repeat as a
fraction of tile height. It is well below 1 because an isometric frame is much
taller than one storey — it also contains the depth receding from the viewer, so
stacking tiles a full frame apart leaves a large gap.

## Running it

```bash
pnpm install
cp .env.example .env.local   # set DATABASE_URL
pnpm dev
```

Keys are bring-your-own: visitors enter an Anthropic key and a fal key in the
browser, and they are sent per request and never stored server-side. Set
`ALLOW_SERVER_KEYS=true` to let the server fall back to its own keys — leave it
off on a public deployment.

Tiles are stored in Postgres by default. Set `S3_BUCKET` (and install
`@aws-sdk/client-s3`) to use an S3-compatible bucket instead.

## Controls

Drag to pan, wheel to pan, cmd/ctrl-wheel to zoom at the cursor. The gutter on
the left labels each floor and holds its delete button. Floor 1 is the reference
tile and cannot be deleted.

## Deploying

The Railway service is connected to `main`: merging deploys. The database is
shared, so floors added locally already exist in production and appear as soon
as the code catches up.

`ALLOW_SERVER_KEYS` is off in production, so visitors bring their own Anthropic
and fal keys.

## Status

**Last shipped**

- One dialog with panes (add / floors / keys) behind a single round button; the control rail is gone.
- Background queue: a floor claims its slot and returns immediately, generating in `after()`. A refresh loses nothing.
- Checkerboard detection by orphan-pixel fraction, rejected and retried once, then a dead floor.
- Theme interpreter on Sonnet with selectable effort; theme cap raised to 2000 characters.
- Zoom as a pinned stepper capped at 100%, plus cmd-scroll and cmd-shift-arrows.
- Static roof, reference floor and basement imported from `public/`; generated floors are edits of the reference.

**Up next**

Issue #4 is the next piece of work: canvas-style pan and zoom, with a camera
that cannot lose the building. Issue #1 remains the overall spec.

Known gaps, in order of how much they cost:

- Generated tiles come back 2912x1440 with the building filling ~99.5% of the
  canvas; the static tiles are 1774x887 filling ~94-97%. Floors therefore sit a
  few percent large with a different vertical offset and do not line up
  precisely. The fix is normalising each tile's bounding box to the reference's.
- Dead floors render in CSS. Artwork for a burnt-out floor would drop into
  `public/dead-floor.png` and replace it.
- Floor numbers are baked into the artwork, so deleting a middle floor leaves
  the ones above it mislabelled.

**Focus**

Open issue #4 and build the canvas. The camera spec is written there and is the
thing to implement, not to redesign.
