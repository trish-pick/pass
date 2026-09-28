/**
 * Common Australian building and drafting terms missing from the general
 * en-AU dictionary. Generic to the industry, so it lives in code; anything
 * specific to one practice belongs in that practice's dictionary instead.
 */
export const constructionTerms = `
airtightness architrave architraves balustrade balustrades batten battens batts bullnose
cavity colorbond cornice cornices countersunk crossover dado downlight downlights downpipe downpipes
eave eaves ensuite ensuites fibreglass fibre fixings flashings flyscreen flyscreens footings formwork
galvanised galvanized glazier glazing gyprock hardiflex hebel hob hobs infill joinery joist joists
kerb kickboard kickboards laminate laminex lintel lintels louvre louvres membrane mullion mullions
noggin noggins nosing nosings offcuts pergola plasterboard powdercoat powdercoated precast primed
purlin purlins rafter rafters rebate rebated reveal reveals ridgecap riser risers sarking screed screeded
setout setback setbacks skillion skirting skirtings skylight skylights slab soffit soffits splashback
spandrel stormwater stud studs subfloor substrate subcontractor subcontractors tiler toilet trimmer
trimmers truss trusses underlay uPVC vapour verandah verandahs weatherboard weatherboards weatherproof
wet waterproofing waterproofed whitegoods woodfire walkway wir robe robes pwdr ldry shwr lounge
alfresco dishwasher rangehood cooktop benchtop benchtops laundry pantry scullery mudroom
sealant sealants silicone thermal hydronic reflective vented unvented permeable impermeable
bushfire curtilage dwelling dwellings outbuilding outbuildings carport carports ramping
tactile tactiles liveable livable accessway accessways datum datums
airer autoclaved backflow blockwork brickwork brickworks cladding claddings conc crossfall dimensioned ductwork
elec grabrail grabrails hobless mins nogging noggings occupancies openable pavers ponding pre ramped resistive
ridgeline sarked sidelight sidelights sidelite sidelites spacings stepdown stepdowns thermosetting trafficable
waterstop waterstops weephole weepholes bbq villaboard squarestop hardieflex fibrecement downturn upturn
`
  .split(/\s+/)
  .filter(Boolean);
