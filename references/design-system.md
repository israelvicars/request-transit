# Transit design system

Transit's look evokes the 1970s New York subway graphics (the Unimark signage standards and the 1972
Vignelli diagram). It **evokes; it does not copy**: no MTA/NYCT logos, names, route letters tied to real
routes, official Pantone colours, or official bullets.

## Research notes (with sources)

**The 1970 NYCTA Graphics Standards Manual.** Unimark International (Massimo Vignelli and Bob Noorda)
was hired in 1966 for signage; a second contract in 1968 produced the *New York City Transit Authority
Graphics Standards Manual*, issued 1970. It standardised black-band signs with white sans-serif type,
coloured route discs, arrows, and a modular sign grid. Route colours had been set in 1967; Unimark
standardised them as Pantone references. [1][2]

**Typeface.** The manual specified *Standard Medium* (Akzidenz-Grotesk as sold in the US), not
Helvetica, because Helvetica was not yet available to the TA's sign shop. Helvetica appeared on NYCTA
material with Vignelli's 1972 map and later became the system face. [1]

**The 1972 Vignelli map.** Designed by Joan Charysyn under Vignelli's direction (Unimark), issued August
1972. A diagram, not a geography: lines only at 0/45/90 degrees, one colour per *route*, each stop a
simple dot, transfers joined, water beige, land white, parks grey. Replaced in 1979; later revived in
the MTA's 2011 Weekender diagram and, per a 2025 dealer note, echoed by the 2025 official map. [2][3][4][5]
Note: Lloyd [2] points out the 45/90 rectilinear format had existed since Salomon's 1958 diagram;
Vignelli refined rather than invented it.

**Colours by route vs by trunk.** 1967 to 1979: each route its own colour (1972 palette in PMS 109,
165, 185, 239, 300, 306, 355, black/401). The 1979 Tauranac/Hertz map switched to *trunk* colouring:
all routes sharing a Manhattan trunk share one colour, still in use. [3][4][6]

**Bullets.** Route designations are letters/numbers in coloured circles ("bullets"); the 1979 map
added diamonds for rush-hour/limited service. [6][7]

**Stations.** Vignelli 1972: a dot per stop on each route line. The geographic MTA map since 1979
distinguishes express (white circle) from local (black dot) stops. Short perpendicular ticks for
stations are the London convention, not New York's. [3][5]

Sources:
1. Untapped New York, "10 Fun Facts About the NYC Transit Authority Graphics Standard" (drawing on Paul Shaw, *Helvetica and the New York City Subway System*). https://www.untappedcities.com/10-fun-facts-about-the-nyc-transit-authority-graphics-standard/
2. Peter B. Lloyd, "Make Straight the Way: genesis of the 1972 map". http://peterblloyd.com/transit/Genesis_of_the_1972_map.pdf
3. Roberts & Lloyd, "Diagrammatic Maps of the New York Subway: an Historical Perspective", Diagrams 2018. https://www.cs.kent.ac.uk/projects/metromap/papers/Diagrams2018-paper104.pdf
4. Open Culture, "Massimo Vignelli Explains His Iconic 1972 New York City Subway Map" (Pantone list in comments). https://www.openculture.com/2014/05/designer-massimo-vignelli-explains-his-iconic-1972-new-york-city-subway-map.html
5. MoMA collection, New York Subway Map 1970-1972. https://www.moma.org/collection/works/89300
6. Wikipedia, John Tauranac. https://en.wikipedia.org/wiki/John_Tauranac
7. MIT subway map list (archived). https://web.archive.org/web/20160827233048/web.mit.edu/glickman/www/submaps.html

## How Transit applies it

| Rule | Transit |
| --- | --- |
| One colour per route (Vignelli, not trunk) | one colour per **service**; every hop *into* a service is drawn in that service's colour |
| 0/45/90 geometry, rounded bends | `corners()` emits only horizontal, vertical and 45° segments; `sample()` rounds bends (r = 14 px). Station y is snapped to 4 px |
| Thick flat strokes | 7 px lines, 10 px pitch between parallel lines |
| Stops are dots/circles | white circle, 3.5 px dark outline; filled centre while a span is running there |
| Transfers joined | a station with several lines becomes a joined vertical **pill** |
| Black band signage, white sans | black title band, white bold type |
| Bullets | coloured circle + white letter A, B, C... in layout order (not real route letters); infrastructure gets a grey square |
| Train | black capsule (request) / white capsule (response) moving along the line, timed from span starts and ends |
| Service changes | amber **DELAY** pill (self time ≥ threshold, counts up live); red **SERVICE ALERT** sign with short reason at the span where the error starts; failed line overlaid with red dashes |
| Strip map | bottom "THIS TRIP" strip: one line in time order, coloured ticks per stop, bullet at first visit, amber under slow spans, red marker at errors, train at the playhead |
| Infrastructure | dotted grey line (DB, cache, broker without its own spans) |

Palette (deliberately off the official PMS values; checked not to equal any official route hex):
`#2A62C9 #1C8F5A #8B46C1 #0B8A99 #C23A7C #6F8A17 #2C3F7E #9A5B26 #4D7FA6 #6A3B78 #2F7A4C #B4572F`.
Amber and red are reserved for delay and alert, never used as line colours.

Layout is deterministic: layers by longest call path, barycentre ordering, ties broken by first-seen time.
No randomness, no clocks, so story 4's frame hashes hold.

## Type

Transit inlines **Arimo** (SIL Open Font License 1.1, `engine/fonts/OFL-Arimo.txt`), subset to Latin,
weights 400 and 700, as the family `"Transit Sans"`. Arimo is metric-compatible with Arial and close to
Helvetica in colour. Inlining keeps renders identical on every machine.

Helvetica, Neue Helvetica, Akzidenz-Grotesk/Standard Medium and the NYCT sign fonts are commercially
licensed and are not bundled. To use one you own: put the `.woff` files in `engine/fonts/` and change the
`face()` sources in `engine/build.mjs` (or edit `F.ui` in `engine/transit.template.html` to name an
installed family). Frame hashes will then only match on machines with the same font file.
