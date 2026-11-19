// Written for Planner+ (v3.6): for each quest (the server's quest list name for it), the quests it needs done
// first, a few short steps and what it unlocks. The full guides are LostHQ's; these only say what's done where.
// Keyed by the server's questlist component; the two miniquests have keys of their own.
export const MINIQUESTS = [
  { key: 'barcrawl', name: "Alfred Grimhand's Barcrawl", lhq: 'barcrawl' },
  { key: 'magearena', name: 'Mage Arena', lhq: 'magearena' },
];

export const STEPS = {
  // ── Free ──
  fortress: {
    steps: [
      'Talk to Sir Amik Varze on the top floor of the White Knights\' Castle in Falador.',
      'Wear a bronze med helm and an iron chainbody to get into the Black Knights\' Fortress north of Falador.',
      'Listen at the grill to learn about the witch\'s invincibility potion.',
      'Drop a cabbage (not one from Draynor Manor) down the hole above the cauldron.',
      'Go back to Sir Amik for your reward.',
    ],
  },
  cook: {
    steps: [
      'Talk to the Cook in Lumbridge Castle\'s kitchen.',
      'Take an egg from the chicken farm north of Lumbridge.',
      'Milk a dairy cow with a bucket.',
      'Pick wheat, put it in the hopper at the top of the windmill north of Lumbridge, work the controls, and take the flour from the bin downstairs with a pot.',
      'Give the Cook the egg, milk and flour.',
    ],
    unlocks: 'Use of the Cook\'s range',
  },
  demon: {
    steps: [
      'Talk to the Gypsy in her tent in Varrock Square. Write down Delrith\'s magic words: they\'re different for everyone.',
      'Talk to Sir Prysin in Varrock Palace: he needs three keys to give you Silverlight.',
      'Key 1: Captain Rovin, at the top of the palace\'s north-west tower.',
      'Key 2: pour a bucket of water down the drain outside the palace kitchen, then pick the key up in the Varrock Sewers.',
      'Key 3: bring Wizard Traiborn in the Wizards\' Tower 25 bones.',
      'Take the keys to Sir Prysin for Silverlight.',
      'Fight Delrith in the stone circle south of Varrock with Silverlight, and say the words when he\'s weakened.',
    ],
    unlocks: 'Silverlight',
  },
  doric: {
    steps: [
      'Talk to Doric in his house north of Falador.',
      'Bring him 6 clay, 4 copper ore and 2 iron ore.',
    ],
    unlocks: 'Use of Doric\'s anvils',
  },
  dragon: {
    steps: [
      'Talk to the Guildmaster in the Champions\' Guild (32 quest points to get in), then to Oziach in Edgeville.',
      'The map to Crandor is in three pieces. One: Melzar\'s Maze in Rimmington (each colour of key from a monster there).',
      'Two: Wormbrain in Port Sarim\'s jail. Pay him 10,000 coins, or kill him through the bars with Ranged or Magic and take it with Telekinetic Grab.',
      'Three: the Oracle on Ice Mountain tells you how to open the magic door in the Dwarven Mine: an unfired bowl, silk, a lobster pot and a wizard\'s mind bomb.',
      'Buy the Lady Lumbridge from Klarense in Port Sarim, patch her hull with planks and nails, and ask Ned in Draynor to sail her.',
      'Get an anti-dragon shield from the Duke of Lumbridge.',
      'Sail to Crandor, climb the volcano to Elvarg\'s lair, and kill Elvarg with the anti-dragon shield on.',
      'Go back to Oziach.',
    ],
    unlocks: 'Wear a rune platebody and a green dragonhide body (Oziach sells them)',
  },
  haunted: {
    steps: [
      'Talk to Veronica outside Draynor Manor, then to Professor Oddenstein at the top of the manor.',
      'The pressure gauge: put poison in the fish food, feed it to the fountain in the garden, then search the fountain.',
      'The rubber tube: the key is in the compost heap (dig with a spade); the tube is in the room with the skeleton.',
      'The oil can: pull the right levers in the basement to reach it.',
      'Give the three parts to the Professor.',
    ],
  },
  gobdip: {
    steps: [
      'Talk to the bartender in the Rusty Anchor in Port Sarim about the goblin generals.',
      'Get three goblin mails from goblins.',
      'Dye one orange (red and yellow dye) and one blue (blue dye).',
      'Give the generals in Goblin Village, north of Falador, the orange, then the blue, then the brown one.',
    ],
  },
  squire: {
    steps: [
      'Talk to the Squire in the White Knights\' Castle courtyard in Falador.',
      'Ask Reldo in the Varrock Palace library about the Imcando dwarves.',
      'Give Thurgo, south of Port Sarim, a redberry pie.',
      'Take the portrait from Sir Vyvin\'s cupboard upstairs in the castle, while he isn\'t looking.',
      'Mine blurite ore in the Asgarnian Ice Dungeon, past the ice warriors and giants.',
      'Bring Thurgo the portrait, the blurite ore and 2 iron bars, and take the sword to the Squire.',
    ],
  },
  imp: {
    steps: [
      'Talk to Wizard Mizgog at the top of the Wizards\' Tower.',
      'Kill imps for a black, red, white and yellow bead.',
      'Give Mizgog the four beads.',
    ],
    unlocks: 'An amulet of accuracy',
  },
  hunt: {
    steps: [
      'Talk to Redbeard Frank in Port Sarim.',
      'Work on Luthas\'s banana plantation on Karamja and hide Karamja rum in the crate you fill.',
      'Get a job at Wydin\'s food store in Port Sarim (wear a white apron) and take the rum from the crate in the back room.',
      'Give Frank the rum for a key. It opens the chest upstairs in the Blue Moon Inn in Varrock.',
      'Dig in Falador Park where the message says (a gardener attacks).',
    ],
  },
  prince: {
    steps: [
      'Talk to Hassan in the Al Kharid palace, then Osman outside it.',
      'Make Ali\'s disguise: a blonde wig (Ned in Draynor makes one from wool; dye it yellow), skin paste (Aggie in Draynor) and a pink skirt.',
      'Get an impression of Lady Keli\'s key in soft clay and give it to Osman with a bronze bar.',
      'Get Joe the guard drunk with 3 beers, tie up Lady Keli with a rope, and free Ali from the jail in Draynor with the key and disguise.',
      'Go back to Hassan.',
    ],
    unlocks: 'Free passage through the Al Kharid gate',
  },
  priest: {
    steps: [
      'Talk to Father Aereck in the Lumbridge church.',
      'Get an amulet of ghostspeak from Father Urhney in the Lumbridge Swamp.',
      'Wear it and talk to the ghost in the coffin by the church.',
      'Take the skull from the altar in the Wizards\' Tower basement (a skeleton attacks).',
      'Put the skull in the ghost\'s coffin.',
    ],
  },
  romeojuliet: {
    steps: [
      'Talk to Romeo in Varrock Square.',
      'Talk to Juliet in her house west of Varrock and take her message to Romeo.',
      'Talk to Father Lawrence in the church north of the square.',
      'Take cadava berries to the Apothecary in south-west Varrock for a potion, and give it to Juliet.',
      'Tell Romeo.',
    ],
  },
  runemysteries: {
    steps: [
      'Talk to Duke Horacio upstairs in Lumbridge Castle: he gives you an air talisman.',
      'Take it to Sedridor in the Wizards\' Tower basement.',
      'Take his research package to Aubury in his rune shop in Varrock.',
      'Take Aubury\'s notes back to Sedridor.',
    ],
    unlocks: 'Aubury and Sedridor teleport you to the Rune Essence mine',
  },
  sheep: {
    steps: [
      'Talk to Fred the Farmer north-west of Lumbridge.',
      'Shear his sheep and spin the wool on the spinning wheel in Lumbridge Castle.',
      'Bring Fred 20 balls of wool.',
    ],
  },
  blackarmgang: {
    steps: [
      'Read "The Shield of Arrav" in the Varrock Palace library (Reldo helps you find it).',
      'Join one gang: the Phoenix Gang (Baraek tells you where they hide; Straven wants Jonny the Beard\'s report from the Blue Moon Inn) or the Black Arm Gang (Katrine wants two Phoenix crossbows).',
      'Each gang has half the shield, so team up with a player in the other gang to swap halves.',
      'Take the whole shield to the curator in the Varrock Museum, then to King Roald.',
    ],
  },
  vampire: {
    steps: [
      'Talk to Morgan in Draynor Village.',
      'Buy Dr Harlow a beer in the Blue Moon Inn in Varrock for a stake.',
      'Take the garlic from the cupboard upstairs in Morgan\'s house.',
      'Open the coffin in Draynor Manor\'s basement and kill Count Draynor with the stake and a hammer on you.',
    ],
  },
  hetty: {
    steps: [
      'Talk to Hetty in Rimmington.',
      'Bring her an onion, an eye of newt, burnt meat and a rat\'s tail.',
      'Drink from her cauldron.',
    ],
  },

  // ── Members ──
  chompybird: {
    steps: [
      'Talk to Rantz the ogre in the Feldip Hills, south of Yanille.',
      'Make ogre arrows: shafts from achey tree logs, feathers, and wolf bone tips (chisel the bones).',
      'Fill the bellows at the swamp bubbles and inflate toads to put down as bait.',
      'Kill a chompy bird with the ogre bow, pluck it, and roast it with what Rantz\'s children ask for.',
      'Give Rantz the roast chompy.',
    ],
    unlocks: 'The ogre bow and ogre arrows; chompy bird hunting',
  },
  biohazard: {
    quests: ['elena'],
    steps: [
      'Talk to Elena in East Ardougne.',
      'Distract the mourners with the pigeons from Jerico\'s garden, and get over the wall into West Ardougne with Omart and Kilron\'s help.',
      'Spoil the mourners\' stew with rotten apples, wear a doctor\'s gown, and take the distillator from their headquarters.',
      'Take the plague sample to Guidor in Varrock (dress as a priest). The Rimmington chemist\'s three liquids go by three couriers.',
      'Report to Elena, then King Lathas.',
    ],
    unlocks: 'King Lathas\'s training field',
  },
  cog: {
    steps: [
      'Talk to Brother Kojo in the clock tower south of Ardougne.',
      'Find the four cogs (red, blue, black and white) in the tower, its basement and its dungeon.',
      'Put each cog on the spindle of its colour, then go back to Kojo.',
    ],
  },
  death: {
    steps: [
      'Talk to Denulth at the Imperial Guard camp in Burthorpe.',
      'Win Harold\'s IOU at dice in the Burthorpe inn (buy him drinks), and read the combination on it.',
      'Put the stone balls on the stone mechanism in the equipment room in that order.',
      'Tenzing the sherpa shows you the secret way once you bring him spiked climbing boots (Dunstan the smith in Burthorpe spikes them).',
      'Tell Denulth.',
    ],
    unlocks: 'Steel claws, and making claws',
  },
  itexam: {
    steps: [
      'Talk to the Examiner at the Exam Centre south-east of Varrock, and get a letter of recommendation from the curator of the Varrock Museum.',
      'Pass the three exams: the students around the Dig Site tell you the answers once you\'ve helped them.',
      'Dig with a trowel and specimen brush where the exams let you, and make the explosive compound.',
      'Blow up the rocks in the dig shaft and take the Zaros tablet to the Expert.',
    ],
  },
  druid: {
    steps: [
      'Talk to Kaqemeex at the stone circle north of Taverley, then Sanfew upstairs in Taverley.',
      'Dip raw beef, raw rat meat, raw bear meat and raw chicken in the Cauldron of Thunder in Taverley Dungeon.',
      'Give Sanfew the enchanted meat, then talk to Kaqemeex.',
    ],
    unlocks: 'The Herblore skill',
  },
  mcannon: {
    steps: [
      'Talk to Captain Lawgof at the dwarves\' camp.',
      'Mend the six broken railings.',
      'Find Gilob\'s remains at the top of the watchtower.',
      'Rescue Lollk from the goblin cave.',
      'Fix the cannon with Lawgof\'s toolkit, and ask Nulodion at the Black Guard base on Ice Mountain about the ammunition.',
    ],
    unlocks: 'Buying a dwarf multicannon, and making cannonballs',
  },
  eadgar: {
    quests: ['druid', 'troll'],
    steps: [
      'Talk to Sanfew in Taverley about a herb the trolls grow.',
      'Talk to Eadgar in his cave on Trollheim, and Burntmeat, the trolls\' cook, in the Troll Stronghold.',
      'Catch the parrot from Ardougne Zoo with pineapple chunks soaked in alcohol, and have the troll guards teach it to talk.',
      'Make a fake man for Burntmeat with Eadgar: dirty robes from the druids, stuffed, and the potion Eadgar asks for.',
      'Take the goutweed from the trolls\' storeroom and give it to Sanfew.',
    ],
    unlocks: 'The Trollheim Teleport spell (61 Magic)',
  },
  elemental_workshop: {
    steps: [
      'Search the bookcase in the house south-west of the Seers\' Village bank and slash the battered book open for its key.',
      'Open the odd-looking wall east of Seers\' Village and go down to the workshop.',
      'Get the water wheel, the bellows and the furnace working again.',
      'Mine elemental ore (the earth elementals guard it), smelt it with 4 coal, and smith an elemental shield.',
    ],
    unlocks: 'The elemental shield, and the workshop',
  },
  crest: {
    steps: [
      'Talk to Dimintheis near Varrock\'s east bank: his sons each have a piece of the family crest.',
      'Caleb in Catherby wants cooked shrimp, salmon, tuna, bass and swordfish.',
      'Avan in Al Kharid wants a perfect ruby ring and a perfect ruby necklace: perfect gold is mined in the Witchaven dungeon.',
      'Cure Johnathon in the Jolly Boar Inn north-east of Varrock with an antipoison.',
      'Kill Chronozon in the Edgeville Wilderness dungeon, hitting him with Wind, Water, Earth and Fire Blast.',
      'Give Dimintheis the crest.',
    ],
    unlocks: 'Gauntlets (Avan makes them goldsmith gauntlets, Caleb cooking gauntlets, Johnathon chaos gauntlets)',
  },
  arena: {
    steps: [
      'Talk to Lady Servil at the Khazard fight arena, south-east of the Battlefield of Khazard.',
      'Take Khazard armour from the chest in the barracks and wear it.',
      'Buy the guard a Khali brew for the cell keys.',
      'Free Jeremy Servil and win your fights: the Khazard ogre, a scorpion and Bouncer. General Khazard is optional.',
      'Talk to Lady Servil.',
    ],
  },
  fishingcompo: {
    steps: [
      'Talk to a dwarf at either end of the White Wolf Mountain passage: win the fishing contest in Hemenster for them.',
      'Buy a contest pass from Bonzo in Hemenster.',
      'Dig up red vine worms, and put garlic in the pipe to move the sinister stranger off the best spot.',
      'Catch a giant carp, and take the trophy to the dwarves.',
    ],
    unlocks: 'The White Wolf Mountain passage',
  },
  viking: {
    steps: [
      'Talk to Brundt the Chieftain in Rellekka\'s longhall.',
      'Win the votes of the council: Manni (a drinking contest), Olaf (play a lyre you make), Peer (his house with nothing on you), Sigli, Sigmund (a chain of trades), Swensen (his maze) and Thorvald (a fight).',
      'Tell Brundt once you have them.',
    ],
    unlocks: 'Rellekka\'s shops and stalls; the enchanted lyre',
  },
  fluffs: {
    steps: [
      'Talk to Gertrude west of Varrock. Her sons, Shilop and Wilough, tell you where Fluffs is for 100 coins.',
      'Climb into the lumber yard north-east of Varrock and give Fluffs milk, then a sardine with doogle leaves.',
      'Find a kitten in the crates there and bring it to Fluffs.',
      'Tell Gertrude.',
    ],
    unlocks: 'A kitten',
  },
  grandtree: {
    steps: [
      'Talk to King Narnode Shareen in the Grand Tree.',
      'Take a bark sample to Hazelmere on the island east of Yanille, and his message back to the king.',
      'Follow Glough\'s plot: his house, the shipyard on Karamja by glider, and his plans; get out of jail with Charlie\'s help.',
      'Find the daconia rock under the tree, past the black demon (172).',
      'Go back to King Narnode.',
    ],
    unlocks: 'The gnome gliders',
  },
  hazeelcult: {
    steps: [
      'Talk to Ceril Carnillean at his house in Ardougne.',
      'Pick a side: the Carnilleans, or Clivet and the cult in the sewers west of Ardougne.',
      'Follow that side through the sewers to the end.',
    ],
  },
  hero: {
    quests: ['blackarmgang', 'zanaris', 'arthur', 'dragon'],
    steps: [
      'Talk to Achietties outside the Heroes\' Guild north of Taverley (55 quest points).',
      'A firebird feather from Entrana: kill the firebird with ice gloves on (the Ice Queen under White Wolf Mountain drops them).',
      'A cooked lava eel: fish it in the Wilderness lava maze with an oily rod (blamish oil from a harralander potion).',
      'The thieves\' armband: rob Scarface Pete\'s mansion in Brimhaven, with a player from the other gang of Shield of Arrav.',
      'Give Achietties the three.',
    ],
    unlocks: 'The Heroes\' Guild; wear a dragon battleaxe and a dragon mace',
  },
  grail: {
    quests: ['arthur'],
    steps: [
      'Talk to King Arthur and Merlin in Camelot.',
      'Ask Brother Galahad, west of McGrubor\'s Wood, about the Grail.',
      'Talk to the High Priest on Entrana.',
      'Find the magic whistles and blow one where it takes you to the Fisher King\'s realm.',
      'Kill the Black Knight Titan with Excalibur, help the Fisher King, and take the Grail to King Arthur.',
    ],
  },
  horror: {
    quests: ['barcrawl'],
    steps: [
      'Talk to Larrissa outside the lighthouse north of the Barbarian Outpost.',
      'Get the lighthouse key from Gunnjorn at the Barbarian Outpost.',
      'Mend the lighthouse: planks, nails and swamp tar for the bridge, molten glass and a tinderbox for the light.',
      'In the basement, put one each of air, water, earth and fire runes, an arrow and a sword into the strange wall.',
      'Kill the dagannoths and their mother (she changes colour: match it with the right spell or style).',
      'Talk to Jossik for a prayer book.',
    ],
    unlocks: 'A god book of your choice',
  },
  junglepotion: {
    quests: ['druid'],
    steps: [
      'Talk to Trufitus in Tai Bwo Wannai.',
      'Find and clean five herbs around Karamja: snake weed, ardrigal, sito foil, volencia moss and rogue\'s purse.',
      'Give them to Trufitus.',
    ],
  },
  legends: {
    quests: ['crest', 'hero', 'zombiequeen', 'upass', 'waterfall'],
    steps: [
      'Talk to Radimus Erkle in the Legends\' Guild (107 quest points) and take the machete.',
      'Map the Kharazi Jungle south of Shilo Village: its west, middle and east.',
      'Call Gujuo with the bull roarer, and help Ungadulu, the shaman in the cavern (a gold bowl, blessed water).',
      'Get through the Viyeldi caves: past the locked gates, the spirits and Viyeldi.',
      'Kill the demon Nezikchened (187) and grow a Yommi tree with the seeds; carve a totem pole from it.',
      'Take the totem pole to Radimus.',
    ],
    unlocks: 'The Legends\' Guild; wear a dragon sq shield',
  },
  zanaris: {
    steps: [
      'Talk to the adventurers in the Lumbridge Swamp.',
      'Chop the tree Shamus the leprechaun hides in: he tells you about the dramen tree.',
      'Go to Entrana, down its dungeon, and cut a branch from the dramen tree (kill the tree spirit, 101).',
      'Make a dramen staff from the branch.',
      'Go into the shed in the Lumbridge Swamp wielding it.',
    ],
    unlocks: 'Zanaris; wear a dragon dagger and a dragon longsword',
  },
  arthur: {
    steps: [
      'Talk to King Arthur in Camelot: Merlin is stuck in a crystal.',
      'Hide in the crate in Arhein\'s ship in Catherby to reach Keep Le Faye, and beat Sir Mordred (39).',
      'Morgan le Faye says you need Excalibur, a black candle, bat bones and the magic words.',
      'Excalibur: the Lady of the Lake, after you help the beggar in Port Sarim. The black candle: the candle maker in Catherby.',
      'Light the black candle on the magic symbol, drop the bat bones, say the words, and tell Thrantax to free Merlin.',
      'Smash the crystal in Camelot with Excalibur.',
    ],
    unlocks: 'Excalibur',
  },
  drunkmonk: {
    steps: [
      'Talk to Brother Omad in the monastery south of Ardougne: his child\'s blanket was stolen.',
      'Take it back from the thieves\' den, through the ladder in the stone circle west of the monastery.',
      'Find Brother Cedric in the woods, give him water, and mend his cart with logs.',
      'Go back to Omad.',
    ],
  },
  murder: {
    steps: [
      'Talk to the guard at the Sinclair Mansion north of Seers\' Village.',
      'Look for clues: the thread on the window, the dagger, fingerprints (flour on the dagger) and what each family member says.',
      'Find out who did it and tell the guard.',
    ],
  },
  druidspirit: {
    quests: ['priestperil', 'priest'],
    steps: [
      'Talk to Drezel under the Paterdomus temple, then find Filliman Tarlock\'s ghost in Mort Myre (wear your amulet of ghostspeak).',
      'Show him he\'s dead (his journal and a mirror) and help him with his spell.',
      'Solve the stones in the grotto: the right things on the right stones.',
      'Bless a silver sickle, then kill three ghasts with what it grows.',
      'Go back to Filliman.',
    ],
    unlocks: 'The blessed silver sickle and druid pouch',
  },
  itgronigen: {
    steps: [
      'Talk to the professor at the Observatory, west of the Tree Gnome Village across the river: his telescope is broken.',
      'Bring 3 planks, a bronze bar and molten glass.',
      'Find the lens mould in the goblin dungeon under the Observatory, and make a lens.',
      'Look through the telescope and tell the professor which constellation you see.',
    ],
  },
  elena: {
    steps: [
      'Talk to Edmond in north-west East Ardougne: his daughter Elena is in West Ardougne.',
      'Pour 4 buckets of water on his garden\'s soft mud, dig down, and pull the sewer grill with a rope.',
      'Wear the gas mask in West Ardougne and find out where Elena is: the Rehnisons, then a hangover cure for Bravek for a warrant.',
      'Get into the plague house and free Elena from its basement.',
      'Tell Edmond.',
    ],
  },
  priestperil: {
    steps: [
      'Talk to King Roald in Varrock, then go to the Paterdomus temple east of Varrock.',
      'Kill the dog in the mausoleum under the temple.',
      'Free Drezel: swap the golden key on the monuments for the iron key, and throw blessed water on the vampire\'s coffin.',
      'Bring Drezel 50 rune essence.',
    ],
    unlocks: 'Morytania (past the temple)',
  },
  regicide: {
    quests: ['upass'],
    steps: [
      'After Underground Pass, King Lathas\'s messenger finds you: talk to King Lathas.',
      'Go through the Underground Pass again to Tirannwn, the land of the elves.',
      'Find Lord Iorwerth\'s camp past the leaf traps, with the tracker\'s help.',
      'Make a barrel bomb: sulphur, quicklime from burned limestone, and naphtha.',
      'Use it on Tyras\'s catapult, then tell Lord Iorwerth and King Lathas.',
    ],
    unlocks: 'Tirannwn; wear a dragon halberd',
  },
  scorpcatcher: {
    quests: ['barcrawl'],
    steps: [
      'Talk to Thormac in the Sorcerer\'s Tower south of Seers\' Village.',
      'Ask the Seer in Seers\' Village where the kharid scorpions are.',
      'Catch the three: in Taverley Dungeon (the dusty key), at the Barbarian Outpost, and in the Edgeville Monastery (31 Prayer).',
      'Bring them back to Thormac.',
    ],
    unlocks: 'Thormac makes mystic staffs from battlestaffs (40,000 coins)',
  },
  seaslug: {
    steps: [
      'Talk to Caroline on the coast south of the Legends\' Guild.',
      'Sail with Holgart to the fishing platform and find Kennith.',
      'Light a torch (rub dry sticks), and let Kennith out through the broken panel with the crane.',
      'Take Holgart to the small island to find Kent, then go back to Caroline.',
    ],
    unlocks: 'The fishing platform',
  },
  mortton: {
    quests: ['priestperil'],
    steps: [
      'Go to Mort\'ton, south of Mort Myre, and read the diary in one of its houses.',
      'Make a serum (tarromin in a vial of water, then ashes) and cure Razmire Keelgan and Ulsquire Shauncy.',
      'Mend the temple with limestone bricks and swamp paste until its flame burns, then make sacred oil.',
      'Burn the shade\'s remains on a pyre made with sacred oil, and report back.',
    ],
    unlocks: 'The temple, and burning shades\' remains',
  },
  sheepherder: {
    steps: [
      'Talk to Councillor Halgrive south of the Ardougne chapel: four plagued sheep are loose.',
      'Buy protective clothing from Doctor Orbon.',
      'Herd the four sheep into the pen with a cattleprod, and feed them poisoned sheep feed.',
      'Burn the bones in the incinerator, and tell Halgrive.',
    ],
  },
  zombiequeen: {
    quests: ['junglepotion'],
    steps: [
      'Talk to Mosol Rei outside Shilo Village: Rashiliyia\'s undead are attacking it.',
      'Dig where Mosol\'s story points you, and show Trufitus what you find.',
      'Follow the trail to Rashiliyia\'s tomb, collecting what Trufitus tells you to bring back.',
      'Put Rashiliyia\'s remains to rest: kill Nazastarool three times (91, 68, 93), then take her corpse to the dolmen.',
      'Go back to Mosol Rei.',
    ],
    unlocks: 'Shilo Village: its cart, mine and shops',
  },
  tbwt: {
    quests: ['junglepotion'],
    steps: [
      'Talk to Timfraku in Tai Bwo Wannai: his three sons won\'t come home.',
      'Lubufu shows you karambwanji and karambwan. Make karambwan paste (it poisons spears).',
      'Tamayu, near the mine: help him kill the Shaikahan with a poisoned spear.',
      'Tinsay, on Cairn Isle: bring him rum with banana, a seaweed and monkey skin sandwich, and more.',
      'Tiadeche: he needs a karambwan vessel with karambwanji in it.',
      'Go back to Timfraku.',
    ],
    unlocks: 'Karambwan fishing and cooking',
  },
  ikov: {
    steps: [
      'Talk to Lucien in the Flying Horse Inn in Ardougne: he wants the Staff of Armadyl.',
      'Get boots of lightness from the Temple of Ikov, past the floor that\'s too heavy to cross.',
      'Get the lever, then past the fire warrior (kill him with Ranged), take the Staff of Armadyl, or side with the Guardians.',
      'Give the staff to Lucien, or kill Lucien for the Guardians.',
    ],
  },
  desertrescue: {
    steps: [
      'Talk to Irena south of the Shantay Pass: her daughter Ana went missing.',
      'Wear desert clothes, go to the Desert Mining Camp, and get in (Captain Siad\'s chest, a pass, slave robes).',
      'Make darts for the camp to get closer to Ana.',
      'Hide Ana in a barrel, get her out on the mine cart, and bring her back to Irena.',
    ],
    unlocks: 'Smithing dart tips',
  },
  tree: {
    steps: [
      'Talk to King Bolren at the spirit tree in the Tree Gnome Maze.',
      'Commander Montai needs 6 logs, then three trackers\' coordinates.',
      'Fire the ballista at the stronghold\'s wall and break in.',
      'Take the orb back from the Khazard Warlord (112) and the others from the warriors.',
      'Give them to King Bolren.',
    ],
    unlocks: 'The spirit trees',
  },
  totem: {
    steps: [
      'Talk to Kangai Mau in Brimhaven: the tribal totem is in Lord Handelmort\'s mansion.',
      'Relabel the crate at the G.P.D.T. depot in Ardougne for Handelmort Mansion, then let Wizard Cromperty teleport you to it.',
      'Read the combination in the mansion, open the door, and take the totem past the traps.',
      'Give it to Kangai Mau.',
    ],
  },
  troll: {
    quests: ['death'],
    steps: [
      'Talk to Denulth at the Imperial Guard camp in Burthorpe.',
      'Climb past Death Plateau to the stronghold and beat Dad, the troll champion.',
      'Get into the Troll Stronghold and its prison (key from Twig and Berry).',
      'Free Godric and Mad Eadgar from the cells.',
      'Tell Denulth.',
    ],
  },
  upass: {
    quests: ['biohazard'],
    steps: [
      'Talk to King Lathas in East Ardougne, then Koftik at the cave west of Ardougne.',
      'Get through the pass: the bridge, the traps, the swamp, the grid and the dwarves.',
      'Make the doll of Iban from its four parts, and kill the three demons for theirs.',
      'Throw the doll into the well to destroy Iban, then go back to King Lathas.',
    ],
    unlocks: 'The Staff of Iban and Iban Blast',
  },
  itwatchtower: {
    steps: [
      'Talk to the wizard in the Watchtower north of Yanille: its shield crystals were stolen.',
      'Get the crystals back from the ogres and skavids, and the ogres\' relic from Gu\'Tanoth.',
      'Make the potion the ogre shaman needs to have them turned back.',
      'Put the crystals back in the tower.',
    ],
    unlocks: 'The Watchtower Teleport spell (58 Magic)',
  },
  waterfall: {
    steps: [
      'Talk to Almera by the Baxtorian Falls, then Hudon at the falls.',
      'Read about Baxtorian in Hadley\'s house, and the book in the Tree Gnome Stronghold\'s library.',
      'Get Glarial\'s pebble from the dungeon under the Tree Gnome Village, then her amulet and urn from her tomb (no weapons or armour).',
      'Get in the falls with a rope, and put the runes and Glarial\'s things on the chalice.',
    ],
  },
  ball: {
    steps: [
      'Talk to the boy outside the witch\'s house in Taverley: his ball went in.',
      'The key is under the doormat. Get past the mouse in the house with cheese.',
      'Get the magnet and the shed key, and beat the witch\'s experiment in the shed.',
      'Take the ball back to the boy.',
    ],
  },
  // ── Miniquests ──
  barcrawl: {
    steps: [
      'Talk to the barbarian guard at the Barbarian Outpost for a barcrawl card.',
      'Drink the special at each bar on the card: two in Varrock, and Falador, Port Sarim, Karamja, Brimhaven, Ardougne, Seers\' Village, Yanille and the Gnome Stronghold.',
      'Show the guard your card.',
    ],
    unlocks: 'The Barbarian Outpost and its agility course',
  },
  magearena: {
    steps: [
      'Go to the Mage Arena in the deep Wilderness (level 55) and talk to Kolodion.',
      'Beat him in each of his forms with combat spells.',
      'Pray at the statues for a god cape.',
    ],
    unlocks: 'A god cape and the god spells',
  },
};
