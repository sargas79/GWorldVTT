/**
 * Which picture each kind of item wears.
 *
 * Foundry hands every item the same bag, and a sheet where a skill, a
 * disadvantage and a sword all wear the same badge has to be read rather than
 * scanned. Each kind gets its own instead, drawn from the icons Foundry itself
 * ships so nothing has to be bundled or served.
 *
 * Equipment goes further than its kind. A category is too coarse to draw
 * from -- batteries, rations and lamp oil are all "consumable", a camera and a
 * crowbar both "tools" -- so a piece of gear is drawn as the thing it is: a
 * weapon by its name and then the skill it is used with (a revolver for a
 * pistol, a bow for a bow), armour by the part of the body it covers, other
 * gear by what it is called. Only plain English words for kinds of object are
 * read, which a book's own gear shares with the Basic Set's; anything
 * unrecognised falls back to its group.
 *
 * This lives in `tools/` rather than in `src/` because both halves of the
 * system need it and only one of them is TypeScript. The compendium's pictures
 * are decided when the packs are built -- the sidebar reads a pack's index,
 * which carries whatever was stored and never runs a document class -- while a
 * character's own items are decided at run time. Two copies of this table
 * would be two tables that disagree the first time one of them changed.
 */

/** What Foundry gives every item, and what this module replaces. */
export const GENERIC_ITEM_ICON = "icons/svg/item-bag.svg";

/**
 * Pictures this module used to hand out, before gear was drawn by what it is.
 * Items made then were stored wearing them, so they are read as "nothing
 * chosen" too, and follow the current default rather than keeping a tankard
 * for a battery.
 */
const RETIRED_DEFAULT_ICONS = new Set([
  "icons/svg/sword.svg",
  "icons/svg/clockwork.svg",
  "icons/svg/tankard.svg",
  "icons/svg/wingfoot.svg",
  "icons/svg/chest.svg",
  "icons/svg/statue.svg",
  "icons/svg/shield.svg",
]);

/** A trait's picture follows its category: an advantage is not a quirk. */
const TRAIT_ICONS = {
  advantage: "icons/svg/upgrade.svg",
  disadvantage: "icons/svg/downgrade.svg",
  perk: "icons/svg/up.svg",
  quirk: "icons/svg/daze.svg",
};

/**
 * Equipment by the group the Gear tab files it under: the picture for gear
 * whose name and attack modes say nothing more particular about it.
 */
const GEAR_ICONS = {
  weapon: "icons/weapons/swords/sword-guard.webp",
  tool: "icons/tools/hand/wrench-adjustable.webp",
  ammunition: "icons/weapons/ammunition/ammunition-bullet.webp",
  consumable: "icons/containers/boxes/parcel.webp",
  vehicle: "icons/environment/vehicles/car-automobile-classic.webp",
  misc: "icons/containers/bags/pack-simple-leather-brown.webp",
};

/**
 * Weapons by what their name calls them, first match wins. The name settles
 * what the skill cannot: a mace and an axe share a skill, as do a club and a
 * broadsword, and a grenade, a stun gun and a revolver are each drawn as
 * themselves rather than as whatever else their skill covers.
 *
 * @type {ReadonlyArray<readonly [RegExp, string]>}
 */
const WEAPON_NAME_ICONS = [
  [
    /grenade launcher|\b(bazooka|rpg|law|atgm|sam)\b|rocket|missile launcher/i,
    "icons/weapons/guns/launcher-rocket-bazooka.webp",
  ],
  [/grenade|molotov/i, "icons/weapons/thrown/grenade-round.webp"],
  [/\b(bomb|dynamite)\b/i, "icons/weapons/thrown/bomb-fuse-black.webp"],
  [/crossbow|prodd/i, "icons/weapons/crossbows/crossbow-simple-brown.webp"],
  [/flamethrower/i, "icons/weapons/guns/flamethrower-spray-fire-orange.webp"],
  [
    /stun gun|taser|cattle prod|stunner|stun baton/i,
    "icons/weapons/clubs/baton-energy-stun-silver-yellow.webp",
  ],
  [/chainsaw/i, "icons/tools/hand/chainsaw-steel-purple.webp"],
  [/\bstake\b/i, "icons/sundries/survival/stake-rough-simple-brown.webp"],
  [/nunchaku/i, "icons/weapons/misc/nunchaku.webp"],
  [/kusari/i, "icons/weapons/sickles/sickle-kusarigama-chain.webp"],
  [/scythe/i, "icons/weapons/sickles/scythe-curved-steel.webp"],
  [/katana/i, "icons/weapons/swords/sword-katana.webp"],
  [/\b(pick|pickaxe)\b/i, "icons/tools/hand/pickaxe-steel-grey.webp"],
  [/knuckle/i, "icons/weapons/fist/fist-knuckles-brass.webp"],
  [/\b(punch|kick)\b/i, "icons/weapons/fist/boxing-gloves.webp"],
  [
    /\b(teeth|fangs|beak|claws?|bite|talons?|horns?)\b/i,
    "icons/weapons/fist/claw-straight-gold.webp",
  ],
  [
    /\b(blackjack|sap|baton|truncheon|nightstick)\b/i,
    "icons/weapons/clubs/baton-night-stick-truncheon.webp",
  ],
  [/\blance\b/i, "icons/weapons/polearms/pike-flared-brown.webp"],
  [/\bnet\b/i, "icons/tools/fishing/net-simple-brown.webp"],
  [/lariat|lasso|garrote/i, "icons/sundries/survival/rope-noose-brown.webp"],
  [/atlatl|harpoon/i, "icons/weapons/polearms/javelin-hooked.webp"],
  [/blowpipe|blowgun|^darts?$/i, "icons/weapons/thrown/dart-feathered.webp"],
  [/warhammer|\bmaul\b|hammer/i, "icons/weapons/hammers/hammer-war-spiked.webp"],
  [/morningstar|morning star/i, "icons/weapons/maces/flail-morning-star.webp"],
  [/\bmace\b/i, "icons/weapons/maces/mace-round-spiked-grey.webp"],
  [/\bclub\b|cudgel|\bbat\b/i, "icons/weapons/clubs/club-banded-brown.webp"],
  [/hatchet|throwing axe|tomahawk/i, "icons/weapons/thrown/throwing-axe.webp"],
  [/javelin/i, "icons/weapons/polearms/javelin.webp"],
  [/quarterstaff|short staff/i, "icons/weapons/staves/staff-simple-brown.webp"],
  [/glaive|naginata/i, "icons/weapons/polearms/glaive-simple.webp"],
  [/cutlass|scimitar|saber|sabre/i, "icons/weapons/swords/scimitar-guard.webp"],
  [/machete/i, "icons/weapons/swords/machete.webp"],
  [/bastard sword|greatsword/i, "icons/weapons/swords/greatsword-crossguard-steel.webp"],
  [/shuriken|throwing star/i, "icons/weapons/thrown/shuriken-blue.webp"],
  [/knife|dagger|dirk|stiletto/i, "icons/weapons/daggers/dagger-simple-black.webp"],
  [/flintlock pistol|wheel-lock|derringer/i, "icons/weapons/guns/pistol-flintlock.webp"],
  [/auto pistol|holdout|machine pistol/i, "icons/weapons/guns/pistol-automatic.webp"],
  [/sniper/i, "icons/weapons/guns/rifle-sniper-long.webp"],
  [/gauss/i, "icons/weapons/guns/rifle-assault-energy-gauss.webp"],
  [/lever-action/i, "icons/weapons/guns/rifle-repeater.webp"],
  [/blunderbuss/i, "icons/weapons/guns/gun-blunderbuss-steel.webp"],
  [/double shotgun|double-barrel/i, "icons/weapons/guns/gun-double-barrel.webp"],
  [/assault|battle rifle|\bicw\b/i, "icons/weapons/guns/rifle-assault-carbine.webp"],
  [/\b(hmg|minigun|gatling)\b/i, "icons/weapons/guns/gun-chain-gatling-heavy.webp"],
];

/**
 * Weapons by the skill their attack modes are used with, first match wins,
 * for the ones their name did not already settle. The skill says what the
 * weapon is -- a pistol, a rifle, a bow, an axe -- where a name like
 * "Scorpion" or "Blaster" says nothing a picture can use.
 *
 * @type {ReadonlyArray<readonly [RegExp, string]>}
 */
const WEAPON_SKILL_ICONS = [
  [/beam weapons? \(pistol\)/i, "icons/weapons/guns/pistol-energy-blaster.webp"],
  [/beam weapons?/i, "icons/weapons/guns/rifle-energy-blaster.webp"],
  [/guns? \(gyroc\)/i, "icons/weapons/guns/pistol-sci-fi.webp"],
  [/guns? \(pistol\)/i, "icons/weapons/guns/pistol-revolver-steel.webp"],
  [/guns? \(submachine gun\)/i, "icons/weapons/guns/machine-gun-sub-pistol.webp"],
  [/guns? \(shotgun\)/i, "icons/weapons/guns/shotgun-pump.webp"],
  [/guns? \(musket\)/i, "icons/weapons/guns/gun-blunderbuss-worn-brown.webp"],
  [
    /guns? \(light machine gun\)|gunner \(machine gun\)/i,
    "icons/weapons/guns/machine-gun-drum.webp",
  ],
  [
    /guns? \((grenade launcher|light anti-armor)/i,
    "icons/weapons/guns/launcher-rocket-bazooka.webp",
  ],
  [/\bguns?\b/i, "icons/weapons/guns/rifle-bolt-action.webp"],
  [/gunner|artillery/i, "icons/weapons/artillery/missile.webp"],
  [/liquid projector/i, "icons/weapons/guns/gun-chemical-sprayer.webp"],
  [/crossbow/i, "icons/weapons/crossbows/crossbow-simple-brown.webp"],
  [/\bbow\b/i, "icons/weapons/bows/longbow-recurve.webp"],
  [/sling/i, "icons/weapons/slings/sling-leather.webp"],
  [/bolas/i, "icons/weapons/thrown/bolas-stone.webp"],
  [/throwing/i, "icons/weapons/thrown/grenade-round.webp"],
  [/whip/i, "icons/weapons/misc/whip-leather.webp"],
  [/force sword|force whip/i, "icons/weapons/swords/sword-runed-glowing.webp"],
  [/two-handed sword/i, "icons/weapons/swords/greatsword-crossguard-steel.webp"],
  [/rapier|smallsword|main-gauche/i, "icons/weapons/swords/sword-guard-flanged.webp"],
  [/saber/i, "icons/weapons/swords/scimitar-guard.webp"],
  [/shortsword/i, "icons/weapons/swords/shortsword-guard.webp"],
  [/sword/i, "icons/weapons/swords/sword-guard.webp"],
  [/knife/i, "icons/weapons/daggers/dagger-simple-black.webp"],
  [/two-handed axe\/mace/i, "icons/weapons/axes/axe-battle-simple.webp"],
  [/axe\/mace/i, "icons/weapons/axes/axe-broad-simple.webp"],
  [/flail/i, "icons/weapons/maces/flail-morning-star.webp"],
  [/polearm/i, "icons/weapons/polearms/halberd-crescent-steel.webp"],
  [/spear/i, "icons/weapons/polearms/spear-flared-steel.webp"],
  [/staff/i, "icons/weapons/staves/staff-simple-brown.webp"],
  [/boxing|brawling|karate|judo|wrestling|sumo/i, "icons/weapons/fist/boxing-gloves.webp"],
];

/**
 * Gear other than weapons, recognised by what it is called, first match wins.
 * Order matters where names overlap: "Laser Sight" is a sight before it is
 * anything else, "Crossbow Bolt" ammunition before a crossbow, and a lab in a
 * suitcase is a lab.
 *
 * @type {ReadonlyArray<readonly [RegExp, string]>}
 */
const GEAR_NAME_ICONS = [
  // Ammunition and power.
  [/\b(arrows?|bolts?)\b/i, "icons/weapons/ammunition/arrow-broadhead.webp"],
  [/\bdarts?\b/i, "icons/weapons/thrown/dart-feathered.webp"],
  [/shotgun shells?|\bshells?\b/i, "icons/weapons/ammunition/ammunition-shotgun-shells.webp"],
  [
    /cartridges?|\brounds?\b|bullets?|magazine|\bclip\b/i,
    "icons/weapons/ammunition/ammunition-bullet-rifle.webp",
  ],
  [/pellets?|sling stones?/i, "icons/weapons/thrown/throwing-stone.webp"],
  [/power cell|batter(y|ies)/i, "icons/commodities/tech/battery-small.webp"],

  // Weapon accessories.
  [/\bsight\b|\bscope\b/i, "icons/weapons/guns/rifle-hunting-scoped-sight.webp"],
  [/silencer|suppressor/i, "icons/weapons/guns/pistol-silenced.webp"],
  [/holster/i, "icons/containers/bags/case-leather-tan.webp"],
  [/quiver/i, "icons/containers/ammunition/arrows-quiver-simple-brown.webp"],
  [/whetstone|sharpening/i, "icons/commodities/stone/ore-chunk-grey.webp"],

  // Medicine.
  [
    /doctor'?s bag|medkit|medical kit|first aid|crash kit/i,
    "icons/tools/medical/medkit-white-red.webp",
  ],
  [/surgical|scalpel/i, "icons/tools/medical/toolkit-surgical-pink.webp"],
  [/bandage/i, "icons/tools/medical/bandages-gauze.webp"],
  [
    /syringe|hypo|injector|antidote|serum|vaccine/i,
    "icons/tools/laboratory/injector-needle-syringe-plunger.webp",
  ],
  [
    /antibiotic|antitoxin|\bdrugs?\b|\bpills?\b|tablets|medicine|medication|painkiller/i,
    "icons/tools/medical/medication-pills-bottle.webp",
  ],

  // Science and detection.
  [
    /\blab\b|laboratory|chemical|chemistry|test kit/i,
    "icons/tools/laboratory/alembic-glass-ball-blue.webp",
  ],
  [/microscope/i, "icons/tools/laboratory/microscope.webp"],
  [/fingerprint|magnifying|magnifier|\blens\b/i, "icons/tools/scribal/magnifying-glass.webp"],
  [/night vision|goggles/i, "icons/equipment/head/goggles-tech.webp"],
  [
    /binoculars|telescope|spyglass|periscope/i,
    "icons/tools/navigation/spyglass-telescope-brass.webp",
  ],
  [
    /\bmeter\b|counter\b|detector|scanner|sensor|analy[sz]er|\bwand\b/i,
    "icons/commodities/tech/dial-meter-gauge-blue.webp",
  ],

  // Electronics.
  [/camera|camcorder/i, "icons/tools/tech/camera.webp"],
  [/\bfilm\b/i, "icons/tools/tech/camera-film.webp"],
  [
    /computer|laptop|\bpda\b|smartphone|\bphone\b/i,
    "icons/commodities/tech/phone-smart-tablet.webp",
  ],
  [/radio|walkie|transceiver|communicator/i, "icons/tools/tech/badge-communicator.webp"],
  [
    /headset|microphone|\bmike\b|recorder|\bbug\b|nanobug|beacon|tracker/i,
    "icons/tools/instruments/microphone-headset.webp",
  ],
  [/\btv\b|television|monitor|projector/i, "icons/tools/tech/projector-film.webp"],
  [/\bgps\b|compass/i, "icons/tools/navigation/compass-brass-blue-red.webp"],
  [/\bmaps?\b|\bcharts?\b/i, "icons/tools/navigation/map-marked-brown.webp"],
  [/watch|clock|timer/i, "icons/commodities/tech/watch.webp"],

  // Light and fire.
  [/flashlight/i, "icons/sundries/lights/flash-light.webp"],
  [/lantern|\blamp\b/i, "icons/sundries/lights/lantern-iron-yellow.webp"],
  [
    /chemlight|glowstick|light stick|\bflares?\b/i,
    "icons/sundries/lights/lantern-emergency-lit.webp",
  ],
  [/candle/i, "icons/sundries/lights/candle-unlit-white.webp"],
  [
    /gas bottle|gasoline|kerosene|\bfuel\b|\boil\b|propane|canister/i,
    "icons/sundries/survival/fuel-canister-green.webp",
  ],
  [/cutting torch|welding|blowtorch/i, "icons/tools/tech/torch-welding-plasma-purple.webp"],
  [/\btorch\b/i, "icons/sundries/lights/torch-brown-lit.webp"],
  [
    /lighter|matches|tinderbox|fire starter/i,
    "icons/sundries/survival/fire-lighter-windproof.webp",
  ],
  [/stove/i, "icons/tools/cooking/pot-camping-iron-black.webp"],

  // Food and drink.
  [/ration|\bfood\b|\bmeals?\b|jerky/i, "icons/consumables/food/ration-canned-fish.webp"],
  [/wineskin|waterskin/i, "icons/sundries/survival/waterskin-leather-brown.webp"],
  [/canteen|water|thermos|flask/i, "icons/sundries/survival/canteen-drinking.webp"],
  [/beer|\bale\b|wine|whiskey|liquor/i, "icons/consumables/drinks/alcohol-beer-mug-yellow.webp"],
  [/bottle|\bjug\b|\bjar\b/i, "icons/consumables/drinks/bottle-modern-capped.webp"],

  // Tools of a trade.
  [/lockpick|lock pick/i, "icons/tools/hand/lockpicks-steel-grey.webp"],
  [/handcuffs|shackles|manacles|restraints/i, "icons/sundries/survival/cuffs-hand.webp"],
  [/disguise|cosmetics|make-?up/i, "icons/sundries/survival/mirror-plain.webp"],
  [/crowbar|pry bar/i, "icons/tools/hand/pry-bar-steel.webp"],
  [/shovel|spade|entrenching/i, "icons/tools/hand/shovel-spade-steel-grey.webp"],
  [/\bsaw\b/i, "icons/tools/hand/saw-steel.webp"],
  [/hammer/i, "icons/tools/hand/hammer-and-nail.webp"],
  [
    /tool ?kit|\btools\b|repair kit|armou?ry|machinist|mechanic|electrician|carpentry/i,
    "icons/tools/hand/wrench-double.webp",
  ],
  [
    /scribe|\bpens?\b|quill|typewriter|wax tablet|notebook|paper/i,
    "icons/tools/scribal/ink-quill-red.webp",
  ],
  [/\bbooks?\b|manual\b|journal|tome/i, "icons/sundries/books/book-worn-brown.webp"],
  [/knitting|needle|sewing|spinning wheel|loom/i, "icons/tools/hand/needle-thread-spool.webp"],
  [/balance|\bscales?\b/i, "icons/tools/hand/scale-balances-merchant-brown.webp"],
  [/\bplow\b|plough|\brake\b|\bhoe\b/i, "icons/tools/hand/rake.webp"],
  [/wheelbarrow|\bcart\b/i, "icons/containers/misc/wheelbarrow-white.webp"],
  [/fishhook|fishing|hooks? & line/i, "icons/tools/fishing/hook-barbed-steel-grey.webp"],
  [
    /\bdrum\b|flute|\bhorn\b|whistle|guitar|\blute\b|harp|instrument/i,
    "icons/tools/instruments/drum-hand-tan.webp",
  ],
  [/\btape\b/i, "icons/sundries/survival/tape-duct.webp"],

  // Outdoor gear and containers.
  [
    /climbing|piton|spike|grapnel|grappl/i,
    "icons/sundries/survival/climbing-anchor-steel-grey.webp",
  ],
  [/\brope\b|\bcord\b|cable|twine/i, "icons/sundries/survival/rope-coiled-brown.webp"],
  [/\bchain\b/i, "icons/tools/fasteners/chain-steel-blue.webp"],
  [/\btent\b|shelter/i, "icons/sundries/survival/shelter-tent-small.webp"],
  [/sleeping|bedroll|blanket|\bfurs?\b/i, "icons/sundries/survival/bedroll-brown.webp"],
  [
    /saddlebag|satchel|shoulder bag|\bbag\b|duffel/i,
    "icons/containers/bags/satchel-leather-brown.webp",
  ],
  [/backpack|rucksack|\bpack\b/i, "icons/containers/bags/pack-leather-brown.webp"],
  [/pouch|purse|wallet/i, "icons/containers/bags/pouch-simple-brown.webp"],
  [
    /suitcase|briefcase|\bcase\b|\bbox\b|crate|\bchest\b/i,
    "icons/containers/boxes/crate-reinforced-brown.webp",
  ],
  [/\bpole\b|\bstaff\b/i, "icons/weapons/staves/staff-simple-brown.webp"],
  [/scuba|diving|air tank|rebreather/i, "icons/equipment/head/helm-environment-protection.webp"],
  [
    /parachute|life jacket|life vest|web gear|harness/i,
    "icons/equipment/chest/harness-tactical-heavy.webp",
  ],
  [/ear ?muffs|ear ?plugs/i, "icons/equipment/head/cap-knit-winter.webp"],

  // Riding and animals.
  [/horseshoe/i, "icons/sundries/misc/horseshoe-iron.webp"],
  [
    /horse|\bpony\b|\bmule\b|donkey|camel|elephant|\box(en)?\b/i,
    "icons/environment/creatures/horse-brown.webp",
  ],
  [
    /saddle|bridle|\bbit\b|\btack\b|stirrups|spurs|lanyard|\bstrap\b|\bbelt\b/i,
    "icons/sundries/survival/leather-strap-brown.webp",
  ],
  [/\bdog\b|hound/i, "icons/creatures/mammals/dog-husky-white-blue.webp"],
  [/falcon|hawk|eagle|\bbird\b|\bowl\b/i, "icons/creatures/birds/raptor-hawk-flying.webp"],
  [/\bcat\b/i, "icons/creatures/mammals/cat-hunched-glowing-red.webp"],

  // Clothing.
  [
    /wardrobe|clothes|clothing|formal wear|uniform|outfit/i,
    "icons/equipment/chest/shirt-collared-brown.webp",
  ],
  [/goat'?s foot|\blever\b/i, "icons/commodities/tech/crank.webp"],
];

/** Armour whose name says more than where it sits, first match wins. */
const ARMOR_NAME_ICONS = [
  [/gas mask/i, "icons/equipment/head/gas-mask.webp"],
  [/visor/i, "icons/equipment/head/goggles-tech.webp"],
  [
    /(space|vacc|hardsuit|battlesuit|armor)[^,]*helmet/i,
    "icons/equipment/head/tech-steel-helm.webp",
  ],
  [
    /ballistic helmet|frag helmet|steel pot|combat helmet/i,
    "icons/equipment/head/helmet-military-green.webp",
  ],
  [/\b(nbc|hazmat|biohazard)\b/i, "icons/equipment/body/suit-biohazard-protection.webp"],
  [
    /space suit|vacc suit|hardsuit|battlesuit|space armor|powered armor/i,
    "icons/equipment/chest/tech-steel.webp",
  ],
  [
    /vest|flak|plate inserts|trauma plates/i,
    "icons/equipment/chest/vest-bulletproof-body-armor.webp",
  ],
  [/ballistic suit|tactical suit|riot/i, "icons/equipment/chest/riot.webp"],
  [/cloak/i, "icons/equipment/back/cloak-brown.webp"],
  [/barding|horse/i, "icons/environment/creatures/horse-brown.webp"],
  [
    /(leather|cloth|fur)[^,]*\b(pants|leggings|skirt)\b/i,
    "icons/equipment/leg/pants-leather-tasset-brown.webp",
  ],
  [/(leather|cloth)[^,]*\bsleeves\b/i, "icons/equipment/wrist/bracer-banded-leather.webp"],
  [/\b(pants|skirt)\b/i, "icons/equipment/leg/pants-leather-tasset-brown.webp"],
  [/\b(cap|hood|coif)\b|leather helm/i, "icons/equipment/head/cap-leather-brown.webp"],
  [/sandals|\bshoes\b/i, "icons/equipment/feet/shoes-leather-simple-brown.webp"],
  [/gloves/i, "icons/equipment/hand/gloves-leather-tan.webp"],
  [
    /(cloth|leather|fur|buff)\b[^,]*\b(armor|jacket|coat|tunic|loincloth)\b|^(cloth|leather) armor/i,
    "icons/equipment/chest/breastplate-layered-leather-brown.webp",
  ],
  [
    /hauberk|mail shirt|^mail \(suit\)|scale armor|light scale/i,
    "icons/equipment/chest/breastplate-scale-grey.webp",
  ],
];

/** Armour by the body part it covers, the largest part first. */
const ARMOR_LOCATION_ICONS = [
  [["torso", "vitals", "groin"], "icons/equipment/chest/breastplate-layered-steel.webp"],
  [["skull", "face", "eye", "neck"], "icons/equipment/head/helm-barbute-steel.webp"],
  [["arm"], "icons/equipment/wrist/bracer-armored-steel.webp"],
  [["hand"], "icons/equipment/hand/gauntlet-armored-steel-grey.webp"],
  [["leg"], "icons/equipment/leg/cuisses-reticulated-steel.webp"],
  [["foot"], "icons/equipment/feet/boots-leather-brown.webp"],
];

/** Shields by size and make, first match wins. */
const SHIELD_NAME_ICONS = [
  [/cloak/i, "icons/equipment/back/cloak-brown.webp"],
  [/force|energy/i, "icons/equipment/shield/heater-crystal-blue.webp"],
  [/buckler/i, "icons/equipment/shield/buckler-wooden-boss-steel.webp"],
  [/plastic|riot/i, "icons/equipment/shield/heater-steel-grey.webp"],
  [/large|tower|pavise/i, "icons/equipment/shield/kite-wooden-boss-steel-brown.webp"],
];

const TYPE_ICONS = {
  skill: "icons/svg/book.svg",
  technique: "icons/svg/target.svg",
  equipment: GEAR_ICONS.misc,
  armor: "icons/equipment/chest/breastplate-layered-steel.webp",
  shield: "icons/equipment/shield/round-wooden-boss-steel-brown.webp",
  language: "icons/svg/sound.svg",
  template: "icons/svg/levels.svg",
  spell: "icons/svg/aura.svg",
  ritual: "icons/svg/circle.svg",
  modifier: "icons/svg/lever.svg",
};

/**
 * The first picture in a list whose pattern the text matches.
 *
 * @param {ReadonlyArray<readonly [RegExp, string]>} table
 * @param {string} text
 * @returns {string | undefined}
 */
function firstMatch(table, text) {
  if (!text) return undefined;
  return table.find(([pattern]) => pattern.test(text))?.[1];
}

/**
 * Whether a piece of equipment has an attack mode.
 *
 * @param {any} system
 * @returns {boolean}
 */
function isArmed(system) {
  return (system?.meleeModes?.length ?? 0) > 0 || (system?.rangedModes?.length ?? 0) > 0;
}

/**
 * The group a piece of equipment is filed under, for the picture alone.
 *
 * The same decision the Gear tab makes, and made here as well because the
 * build tool has no TypeScript to call: a vehicle is a vehicle even with a gun
 * on it, anything else with an attack mode is a weapon whatever it was filed
 * as, and gear with no category at all is miscellaneous.
 *
 * @param {{category?: string, meleeModes?: readonly unknown[], rangedModes?: readonly unknown[]}} system
 * @returns {keyof GEAR_ICONS}
 */
function gearGroupForIcon(system) {
  if (system?.category === "vehicle") return "vehicle";
  if (isArmed(system)) return "weapon";
  const category = String(system?.category ?? "");
  return category in GEAR_ICONS ? /** @type {keyof GEAR_ICONS} */ (category) : "misc";
}

/**
 * The picture for a piece of equipment: a weapon by its name and then its
 * skills, other gear by its name, and failing those the group it is filed
 * under.
 *
 * @param {any} system
 * @param {string} name
 * @returns {string}
 */
function equipmentIcon(system, name) {
  const group = gearGroupForIcon(system);
  if (group === "vehicle") return GEAR_ICONS.vehicle;
  if (group === "weapon") {
    const skills = [...(system?.meleeModes ?? []), ...(system?.rangedModes ?? [])]
      .map((mode) => String(mode?.skill ?? ""))
      .filter(Boolean);
    return (
      firstMatch(WEAPON_NAME_ICONS, name) ??
      skills.map((skill) => firstMatch(WEAPON_SKILL_ICONS, skill)).find(Boolean) ??
      GEAR_ICONS.weapon
    );
  }
  return (
    firstMatch(GEAR_NAME_ICONS, name) ?? firstMatch(WEAPON_NAME_ICONS, name) ?? GEAR_ICONS[group]
  );
}

/**
 * The picture for armour: by its name where that says what it is, else by
 * the largest part of the body it covers.
 *
 * @param {any} system
 * @param {string} name
 * @returns {string}
 */
function armorIcon(system, name) {
  const named = firstMatch(ARMOR_NAME_ICONS, name);
  if (named) return named;
  const locations = new Set((system?.locations ?? []).map((l) => String(l)));
  return (
    ARMOR_LOCATION_ICONS.find(([parts]) => parts.some((p) => locations.has(p)))?.[1] ??
    TYPE_ICONS.armor
  );
}

/**
 * The default picture for an item of this type.
 *
 * @param {string} type
 * @param {any} [system]
 * @param {string} [name] What the item is called, which settles the picture
 *   for gear, armour and shields.
 * @returns {string}
 */
export function defaultItemIcon(type, system, name) {
  const itemName = String(name ?? "");
  if (type === "trait") {
    const category = String(system?.category ?? "");
    return TRAIT_ICONS[category] ?? TRAIT_ICONS.advantage;
  }
  if (type === "equipment") return equipmentIcon(system ?? {}, itemName);
  if (type === "armor") return armorIcon(system ?? {}, itemName);
  if (type === "shield") return firstMatch(SHIELD_NAME_ICONS, itemName) ?? TYPE_ICONS.shield;
  return TYPE_ICONS[type] ?? GENERIC_ITEM_ICON;
}

/**
 * Whether an image is Foundry's bag, one of this module's former defaults, or
 * no image at all: no choice made.
 *
 * @param {unknown} img
 * @returns {boolean}
 */
export function isGenericIcon(img) {
  const path = String(img ?? "").trim();
  return path === "" || path === GENERIC_ITEM_ICON || RETIRED_DEFAULT_ICONS.has(path);
}

/**
 * The image to show for an item: what was chosen for it, else the default for
 * its kind.
 *
 * @param {unknown} img
 * @param {string} type
 * @param {any} [system]
 * @param {string} [name]
 * @returns {string}
 */
export function itemIcon(img, type, system, name) {
  return isGenericIcon(img) ? defaultItemIcon(type, system, name) : String(img);
}
