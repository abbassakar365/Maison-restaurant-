/* ===== Built-in copy of the menu =====
   The live menu is edited by the team in the team app (Menu tab) and stored in the database.
   This copy is shown if the database cannot be reached, and it is also where the dish photos
   in images/menu/ are matched to dishes by name when a database row has no photo of its own.

   Each dish: [name, price USD, photo slug, ingredients, tags, description]
   photo slug : the file images/menu/<slug>.webp (empty string = no photo yet)
   tags       : h = halal meat · v = vegetarian · m = meat (beef, veal, lamb) · c = poultry
                f = fish & seafood · g = contains gluten · s = spicy   (see TAGS below)
   description: one or two sentences shown in the dish details dialog
   After changing dishes here, run  node scripts/menu-sql.mjs  to refresh the SQL files.
   The menu is 100% pork-free and alcohol-free — keep it that way when adding dishes. */

export const MENU = [
  { id: 'mezza', name: 'Mezza', note: 'Small plates to share — French classics with a Beirut accent', tint: '#efe4cf', items: [
    ['Hummus à l\'huile de truffe', 7, 'hummus-truffe', 'Chickpeas, tahini, lemon, garlic, black truffle oil, olive oil', 'v',
      'Silky chickpea and tahini hummus, finished with a thread of black truffle oil and good olive oil.'],
    ['Moutabal fumé', 7, 'moutabal-fume', 'Charred aubergine, tahini, lemon, garlic, pomegranate, parsley', 'v',
      'Aubergine charred over the flame until smoky, then beaten with tahini and lemon and scattered with pomegranate seeds.'],
    ['Taboulé', 6, 'taboule', 'Parsley, mint, bulgur, tomato, spring onion, lemon, olive oil', 'vg',
      'Our Beirut classic: a mountain of finely chopped parsley and mint with a little bulgur, tomato and spring onion, dressed sharp with lemon.'],
    ['Fattoush', 7, 'fattoush', 'Romaine, radish, cucumber, tomato, sumac, toasted pita, pomegranate molasses', 'vg',
      'Crisp romaine, radish and cucumber with sumac and shards of toasted pita, dressed with pomegranate molasses.'],
    ['Rillettes de poulet', 9, 'rillettes-poulet', 'Slow-cooked chicken, butter, thyme, shallot, cornichons, toasted baguette', 'hcg',
      'Chicken slow-cooked in butter and thyme, shredded and potted the Loire way. Served with cornichons and toasted baguette.'],
    ['Gougères au gruyère', 8, 'gougeres', 'Choux pastry, gruyère, butter, egg, nutmeg', 'vg',
      'Warm choux puffs baked with gruyère and a touch of nutmeg. Light, airy and best eaten straight from the oven.'],
    ['Pâté de campagne (beef & chicken)', 10, 'pate-de-campagne', 'Beef, chicken liver, shallot, black pepper, cornichons, Dijon', 'hmc',
      'A coarse country terrine of beef and chicken liver with shallot and black pepper, served with cornichons and Dijon mustard.'],
    ['Warda — mini croque bites', 9, 'mini-croque-bites', 'Brioche, smoked beef, béchamel, emmental', 'hmg',
      'Bite-sized croque-monsieur: brioche layered with smoked beef, béchamel and emmental, toasted until golden.'],
    ['Labneh aux herbes de Provence', 6, 'labneh-herbes', 'Strained yoghurt, herbes de Provence, olive oil, za\'atar crisps', 'vg',
      'Thick strained yoghurt swirled with herbes de Provence and olive oil, with crisp za\'atar bread for scooping.'],
    ['Kebbé croustillant', 9, 'kebbe-croustillant', 'Bulgur shell, minced beef, onion, pine nuts, seven spices, yoghurt dip', 'hmg',
      'Crisp bulgur shells filled with spiced minced beef, onion and pine nuts, served with a cool yoghurt dip.'],
    ['Escargots au beurre persillé', 13, 'escargots', 'Burgundy snails, garlic butter, parsley, shallot, baguette', 'g',
      'Burgundy snails baked in garlic and parsley butter, with baguette to mop up every drop.'],
    ['Batata harra', 6, 'batata-harra', 'Crispy potatoes, garlic, coriander, chilli, lemon', 'vs',
      'Crispy potatoes tossed with garlic, fresh coriander, chilli and lemon. Beirut\'s favourite side, served hot.'],
    ['Olives & marinated feta', 6, 'olives-feta', 'Green and black olives, feta, orange zest, thyme, chilli flakes', 'v',
      'Green and black olives with feta marinated in orange zest, thyme and a pinch of chilli.']
  ]},
  { id: 'starters', name: 'Starters & Salads', note: 'Entrées and fresh salads', tint: '#e6ead6', items: [
    ['Soupe à l\'oignon gratinée', 10, 'soupe-oignon', 'Caramelised onions, beef broth, thyme, baguette crouton, melted gruyère', 'hmg',
      'Onions caramelised slowly in butter, simmered in beef broth and baked under a baguette crouton and melted gruyère.'],
    ['Salade niçoise', 14, 'salade-nicoise', 'Tuna, green beans, potato, egg, olives, tomato, anchovy, Dijon vinaigrette', 'f',
      'Tuna, green beans, potato, egg, olives and tomato with anchovy, in a Dijon vinaigrette. A taste of the Riviera.'],
    ['Salade de chèvre chaud', 13, 'chevre-chaud', 'Warm goat cheese toasts, mesclun, walnuts, honey, balsamic', 'vg',
      'Goat cheese toasts warmed under the grill on a bed of mesclun, with walnuts, honey and balsamic.'],
    ['Salade César au poulet', 13, 'cesar-poulet', 'Grilled chicken, romaine, parmesan, croutons, Caesar dressing', 'hcg',
      'Grilled chicken on crisp romaine with parmesan, croutons and our house Caesar dressing.'],
    ['Velouté de potiron', 9, 'veloute-potiron', 'Pumpkin, cream, nutmeg, toasted seeds, chive oil', 'v',
      'A smooth pumpkin soup with cream and nutmeg, finished with toasted seeds and chive oil.'],
    ['Œufs mimosa', 8, 'oeufs-mimosa', 'Eggs, mayonnaise, Dijon mustard, chives, paprika', 'v',
      'Halved eggs filled with their own yolks whipped with mayonnaise and Dijon, topped with chives and paprika.'],
    ['Tartare de saumon', 16, 'tartare-saumon', 'Fresh salmon, shallot, capers, dill, lime, avocado', 'f',
      'Fresh salmon cut by hand with shallot, capers and dill, brightened with lime and served with avocado.'],
    ['Carpaccio de bœuf', 15, 'carpaccio-boeuf', 'Thin-sliced beef fillet, rocket, parmesan, capers, lemon olive oil', 'hm',
      'Paper-thin slices of beef fillet with rocket, parmesan shavings, capers and lemon olive oil.'],
    ['Quiche au bœuf fumé', 11, 'quiche-boeuf-fume', 'Shortcrust, eggs, cream, smoked beef, gruyère', 'hmg',
      'Shortcrust filled with a soft egg-and-cream custard, smoked beef and gruyère, served warm.'],
    ['Soupe de poisson', 12, 'soupe-de-poisson', 'Rockfish soup, saffron, rouille, croutons, gruyère', 'fg',
      'A deep rockfish soup scented with saffron, served the Marseille way with rouille, croutons and gruyère.'],
    ['Salade lyonnaise au bœuf fumé', 13, 'salade-lyonnaise', 'Frisée, poached egg, crispy smoked beef strips, croutons, warm vinaigrette', 'hmg',
      'Frisée with a poached egg, crispy smoked beef and croutons, tossed in a warm vinaigrette.'],
    ['Burrata & tomates anciennes', 15, 'burrata-tomates', 'Burrata, heirloom tomatoes, basil, olive oil, fleur de sel', 'v',
      'Creamy burrata with heirloom tomatoes, basil, olive oil and fleur de sel. Simple, and perfect in season.']
  ]},
  { id: 'mains', name: 'Main Course', note: 'Plats principaux', tint: '#ecd9d2', items: [
    ['Steak frites, sauce au poivre', 28, 'steak-frites', 'Beef entrecôte, hand-cut fries, green peppercorn sauce, salad', 'hm',
      'Beef entrecôte grilled to your liking with hand-cut fries, green peppercorn sauce and a side salad.'],
    ['Bœuf braisé à la bourguignonne', 26, 'boeuf-bourguignon', 'Beef slow-braised in beef stock and red grape juice, mushrooms, pearl onions, carrots, mashed potato', 'hm',
      'Beef braised for hours in stock and red grape juice with mushrooms, pearl onions and carrots, over mashed potato. All the depth of the classic, without the wine.'],
    ['Poulet rôti à la française', 22, 'poulet-roti', 'Half roast chicken, thyme, garlic, jus, gratin dauphinois', 'hc',
      'Half a chicken roasted with thyme and garlic, with its own jus and a creamy gratin dauphinois.'],
    ['Poulet à la crème et aux champignons', 24, 'poulet-creme-champignons', 'Chicken thighs, mushrooms, cream, shallots, tarragon, tagliatelle', 'hcg',
      'Chicken thighs in a mushroom, shallot and tarragon cream, served over tagliatelle.'],
    ['Filet de saumon, beurre blanc', 27, 'saumon-beurre-blanc', 'Salmon fillet, beurre blanc, spinach, crushed potatoes', 'f',
      'Pan-seared salmon with a classic beurre blanc, wilted spinach and crushed potatoes.'],
    ['Magret de canard à l\'orange', 30, 'magret-canard-orange', 'Duck breast, orange sauce, potato fondant, green beans', 'c',
      'Duck breast cooked pink with a bright orange sauce, potato fondant and green beans.'],
    ['Bouillabaisse', 32, 'bouillabaisse', 'Mediterranean fish & seafood stew, saffron, fennel, rouille, croutons', 'fg',
      'Mediterranean fish and seafood stewed with saffron and fennel, served with rouille and croutons.'],
    ['Blanquette de veau', 27, 'blanquette-de-veau', 'Veal in creamy white sauce, carrots, mushrooms, rice pilaf', 'hm',
      'Tender veal in a silky white sauce with carrots and mushrooms, served with rice pilaf.'],
    ['Hachis Parmentier', 19, 'hachis-parmentier', 'Minced beef, onion, thyme, mashed potato gratin, side salad', 'hm',
      'Minced beef cooked with onion and thyme under a golden mashed-potato gratin, with a side salad.'],
    ['Moules marinières', 23, 'moules-marinieres', 'Mussels, garlic, shallots, parsley, cream, lemon, fries', 'f',
      'Mussels steamed with garlic, shallots, parsley and a splash of cream, with fries on the side.'],
    ['Ratatouille provençale', 17, 'ratatouille', 'Aubergine, courgette, peppers, tomato, herbs de Provence, rice', 'v',
      'Aubergine, courgette, peppers and tomato simmered slowly with Provençal herbs, served with rice.'],
    ['Filet mignon, sauce morilles', 36, 'filet-mignon-morilles', 'Beef tenderloin, morel cream sauce, pommes purée, asparagus', 'hm',
      'Beef tenderloin with a morel cream sauce, pommes purée and asparagus.'],
    ['Croziflette au poulet', 21, 'croziflette', 'Buckwheat pasta, reblochon cheese, chicken, onions, cream', 'hcg',
      'An Alpine comfort dish: buckwheat pasta baked with reblochon, chicken, onions and cream.']
  ]},
  { id: 'sandwiches', name: 'Sandwiches', note: 'Served with fries or salad', tint: '#f0e2c4', items: [
    ['Croque-monsieur au bœuf fumé', 12, 'croque-monsieur', 'Pain de mie, smoked beef, béchamel, gruyère, Dijon', 'hmg',
      'Pain de mie with smoked beef, béchamel, gruyère and Dijon, toasted until the top bubbles.'],
    ['Croque-madame', 13, 'croque-madame', 'Croque-monsieur topped with a fried egg', 'hmg',
      'Our croque-monsieur crowned with a fried egg.'],
    ['Baguette bœuf fumé-beurre', 10, 'baguette-boeuf-fume', 'Baguette, salted butter, smoked beef, cornichons', 'hmg',
      'The Parisian classic: crusty baguette, salted butter, smoked beef and cornichons.'],
    ['Poulet Dijonnais', 12, 'poulet-dijonnais', 'Baguette, grilled chicken, Dijon mayonnaise, lettuce, tomato', 'hcg',
      'Grilled chicken in a baguette with Dijon mayonnaise, lettuce and tomato.'],
    ['Steak-baguette', 15, 'steak-baguette', 'Baguette, sliced entrecôte, caramelised onions, Café de Paris butter', 'hmg',
      'Sliced entrecôte in a baguette with caramelised onions and Café de Paris butter.'],
    ['Saumon fumé & crème', 14, 'saumon-fume-creme', 'Pain de seigle, smoked salmon, herb cream cheese, capers, dill', 'fg',
      'Smoked salmon on rye with herb cream cheese, capers and dill.'],
    ['Pan bagnat', 12, 'pan-bagnat', 'Round bread, tuna, egg, olives, tomato, peppers, olive oil', 'fg',
      'A round loaf packed with tuna, egg, olives, tomato and peppers and soaked with olive oil, the Niçois way.'],
    ['Le Végétarien', 11, 'le-vegetarien', 'Ciabatta, grilled vegetables, goat cheese, pesto, rocket', 'vg',
      'Grilled vegetables, goat cheese, pesto and rocket in a ciabatta.'],
    ['Burger Maison', 16, 'burger-maison', 'Beef patty, brioche bun, comté, caramelised onions, sauce maison', 'hmg',
      'Our beef patty in a brioche bun with comté, caramelised onions and sauce maison.'],
    ['Chicken Caesar wrap', 12, 'chicken-caesar-wrap', 'Tortilla, grilled chicken, romaine, parmesan, Caesar dressing', 'hcg',
      'Grilled chicken, romaine, parmesan and Caesar dressing rolled in a soft tortilla.'],
    ['Croissant poulet-avocat', 12, 'croissant-poulet-avocat', 'Butter croissant, chicken, avocado, lettuce, lemon mayo', 'hcg',
      'A butter croissant filled with chicken, avocado, lettuce and lemon mayonnaise.'],
    ['Merguez-frites', 13, 'merguez-frites', 'Baguette, spicy beef merguez, harissa mayo, fries inside', 'hmgs',
      'Spicy beef merguez in a baguette with harissa mayo and the fries tucked inside, the way it is eaten in Paris.']
  ]},
  { id: 'desserts', name: 'Desserts', note: 'Pâtisserie maison', tint: '#f2dfe0', items: [
    ['Crème brûlée à la vanille', 8, 'creme-brulee', 'Cream, egg yolks, Madagascar vanilla, caramelised sugar', 'v',
      'Vanilla custard with a crackling caramelised sugar top, made with Madagascar vanilla.'],
    ['Tarte Tatin', 9, 'tarte-tatin', 'Caramelised apples, puff pastry, crème fraîche', 'vg',
      'Apples caramelised slowly under puff pastry, turned out warm and served with crème fraîche.'],
    ['Mousse au chocolat', 8, 'mousse-chocolat', 'Dark chocolate, eggs, sugar, sea salt', 'v',
      'Dark chocolate mousse, light and intense, with a pinch of sea salt.'],
    ['Profiteroles', 10, 'profiteroles', 'Choux buns, vanilla ice cream, warm chocolate sauce, almonds', 'vg',
      'Choux buns filled with vanilla ice cream, drowned in warm chocolate sauce and scattered with almonds.'],
    ['Crêpe Suzette (alcohol-free)', 9, 'crepe-suzette', 'Crêpes, orange butter sauce, orange zest, sugar', 'vg',
      'Thin crêpes folded in an orange butter sauce with zest and sugar. All the flavour, no liqueur.'],
    ['Île flottante', 8, 'ile-flottante', 'Poached meringue, crème anglaise, caramel, pralines', 'v',
      'A cloud of poached meringue floating on crème anglaise, with caramel and crushed pralines.'],
    ['Éclair au café', 6, 'eclair-cafe', 'Choux pastry, coffee cream, coffee glaze', 'vg',
      'Choux pastry filled with coffee cream under a coffee glaze.'],
    ['Macarons (box of 6)', 12, 'macarons', 'Almond meringue shells, ganache: pistachio, raspberry, chocolate, vanilla, lemon, rose', 'v',
      'Six almond meringue macarons: pistachio, raspberry, chocolate, vanilla, lemon and rose.'],
    ['Mille-feuille', 9, 'mille-feuille', 'Puff pastry, vanilla pastry cream, icing', 'vg',
      'Three layers of puff pastry with vanilla pastry cream and classic icing.'],
    ['Fondant au chocolat', 10, 'fondant-chocolat', 'Molten chocolate cake, vanilla ice cream', 'vg',
      'A warm chocolate cake with a molten centre, served with vanilla ice cream.'],
    ['Tarte au citron meringuée', 8, 'tarte-citron-meringuee', 'Shortcrust, lemon curd, torched meringue', 'vg',
      'Shortcrust filled with sharp lemon curd and topped with torched meringue.'],
    ['Paris-Brest', 10, 'paris-brest', 'Choux ring, praliné hazelnut cream, flaked almonds', 'vg',
      'A ring of choux filled with praliné hazelnut cream and finished with flaked almonds.'],
    ['Halawet el jeben à la française', 9, 'halawet-el-jeben', 'Semolina-cheese rolls, ashta cream, rose syrup, pistachio', 'vg',
      'Beirut\'s sweet semolina-cheese rolls with ashta cream, rose syrup and pistachio, finished with a French touch.']
  ]},
  { id: 'soft', name: 'Soft Drinks', note: 'Chilled bottles and cans', tint: '#dfe8ec', items: [
    ['Coca-Cola', 3, 'coca-cola', 'Carbonated water, sugar, caramel colour, natural flavours, caffeine', 'v',
      'The classic, served chilled with ice and a slice of lemon on request.'],
    ['Coca-Cola Zero', 3, 'coca-cola-zero', 'Carbonated water, sweeteners, natural flavours, caffeine', 'v',
      'Zero sugar, served chilled.'],
    ['Pepsi', 3, 'pepsi', 'Carbonated water, sugar, caramel colour, flavours, caffeine', 'v',
      'Served chilled, with ice on request.'],
    ['7UP', 3, '7up', 'Carbonated water, sugar, lemon-lime flavour', 'v',
      'Crisp lemon-lime soda, served chilled.'],
    ['Orangina', 4, 'orangina', 'Sparkling water, orange juice, orange pulp, sugar', 'v',
      'Lightly sparkling orange with real pulp, served chilled.'],
    ['Schweppes Tonic', 3, 'schweppes-tonic', 'Carbonated water, sugar, quinine, citrus extract', 'v',
      'Dry, bitter tonic with quinine. Lovely over ice with a slice of lemon.'],
    ['Perrier', 4, 'perrier', 'Sparkling natural mineral water', 'v',
      'Sparkling mineral water from the south of France.'],
    ['Evian (75cl)', 5, 'evian', 'Still natural mineral water', 'v',
      'Still mineral water from the French Alps, 75 cl bottle.'],
    ['Sohat (local still water)', 2, 'sohat', 'Still Lebanese spring water', 'v',
      'Still spring water from the Lebanese mountains.'],
    ['Ginger ale', 3, 'ginger-ale', 'Carbonated water, sugar, ginger extract', 'v',
      'Gently spiced ginger soda, served chilled.'],
    ['Red Bull', 5, 'red-bull', 'Carbonated water, sugar, taurine, caffeine, B vitamins', 'v',
      'Energy drink, served chilled.'],
    ['Laban ayran', 3, 'laban-ayran', 'Yoghurt, water, salt, mint', 'v',
      'Chilled salted yoghurt drink with a hint of mint. Refreshing with mezza or anything spicy.']
  ]},
  { id: 'hot', name: 'Hot Drinks', note: 'Coffee, tea and more', tint: '#e8dccd', items: [
    ['Espresso', 3, 'espresso', 'Single shot of Arabica espresso', 'v',
      'A single shot of our Arabica blend, pulled short.'],
    ['Café crème', 4, 'cafe-creme', 'Espresso, steamed milk, milk foam', 'v',
      'Espresso with steamed milk and a thin layer of foam, the Paris café staple.'],
    ['Cappuccino', 5, 'cappuccino', 'Espresso, steamed milk, thick foam, cocoa', 'v',
      'Espresso under thick milk foam, dusted with cocoa.'],
    ['Café latte', 5, 'cafe-latte', 'Espresso, plenty of steamed milk', 'v',
      'A gentle espresso with plenty of steamed milk.'],
    ['Café turc (Lebanese coffee)', 3, 'cafe-turc', 'Finely ground coffee, cardamom, sugar on request', 'v',
      'Finely ground coffee brewed slowly with cardamom, the way it is made all over Beirut. Sugar on request.'],
    ['Chocolat chaud à l\'ancienne', 6, 'chocolat-chaud', 'Dark chocolate melted in whole milk, whipped cream', 'v',
      'Dark chocolate melted into whole milk, topped with whipped cream.'],
    ['Thé à la menthe', 4, 'the-menthe', 'Green tea, fresh mint, sugar on request', 'v',
      'Green tea brewed with fresh mint. Sugar on request.'],
    ['Earl Grey', 4, 'earl-grey', 'Black tea, bergamot', 'v',
      'Black tea scented with bergamot.'],
    ['Camomille', 4, 'camomille', 'Chamomile flowers', 'v',
      'A soothing infusion of chamomile flowers.'],
    ['Verveine', 4, 'verveine', 'Lemon verbena leaves', 'v',
      'Lemon verbena infusion, light and fresh.'],
    ['Chai latte', 5, 'chai-latte', 'Black tea, cinnamon, cardamom, ginger, steamed milk', 'v',
      'Black tea simmered with cinnamon, cardamom and ginger, topped with steamed milk.'],
    ['Café viennois', 6, 'cafe-viennois', 'Espresso, hot water, whipped cream, chocolate shavings', 'v',
      'Espresso lengthened with hot water under whipped cream and chocolate shavings.']
  ]},
  { id: 'cold', name: 'Cold Drinks', note: 'Fresh juices, iced coffee and mocktails', tint: '#d9e6e0', items: [
    ['Citronnade maison', 5, 'citronnade', 'Fresh lemon, mint, sugar, sparkling or still water', 'v',
      'Fresh lemon and mint, lightly sweetened, with sparkling or still water. Made to order.'],
    ['Jus d\'orange pressé', 6, 'jus-orange-presse', 'Freshly squeezed oranges', 'v',
      'Oranges squeezed when you order.'],
    ['Jus de carotte', 5, 'jus-carotte', 'Fresh carrots, a touch of orange', 'v',
      'Fresh carrot juice with a touch of orange.'],
    ['Cocktail de fruits', 7, 'cocktail-de-fruits', 'Strawberry, banana, mango, avocado, ashta, honey', 'v',
      'A Beirut classic: strawberry, banana, mango and avocado layered with ashta cream and honey.'],
    ['Iced latte', 5, 'iced-latte', 'Espresso, cold milk, ice', 'v',
      'Espresso over cold milk and ice.'],
    ['Café frappé', 6, 'cafe-frappe', 'Espresso, milk, vanilla, ice, whipped cream', 'v',
      'Espresso shaken with milk, vanilla and ice, topped with whipped cream.'],
    ['Thé glacé pêche', 5, 'the-glace-peche', 'Black tea, peach, lemon, ice', 'v',
      'Black tea brewed and chilled with peach and lemon, over ice.'],
    ['Virgin mojito', 6, 'virgin-mojito', 'Lime, mint, sugar, soda water, crushed ice (no alcohol)', 'v',
      'Lime, mint and sugar muddled with soda water over crushed ice. No alcohol.'],
    ['Diabolo menthe', 4, 'diabolo-menthe', 'Lemonade, mint syrup', 'v',
      'Lemonade with a dash of mint syrup, the French café classic.'],
    ['Smoothie fruits rouges', 7, 'smoothie-fruits-rouges', 'Strawberry, raspberry, blueberry, yoghurt, honey', 'v',
      'Strawberry, raspberry and blueberry blended with yoghurt and honey.'],
    ['Milkshake vanille', 6, 'milkshake-vanille', 'Vanilla ice cream, milk, whipped cream', 'v',
      'Vanilla ice cream blended with milk, topped with whipped cream.'],
    ['Jallab', 5, 'jallab', 'Grape molasses, date syrup, rose water, pine nuts, raisins', 'v',
      'Grape molasses and date syrup with rose water, served over ice with pine nuts and raisins.'],
    ['Limonade à la rose', 5, 'limonade-rose', 'Lemon, rose water, sugar, sparkling water', 'v',
      'Lemon and rose water with a little sugar, topped up with sparkling water.']
  ]}
];

/* Dietary labels, in display order: label (legend, dialog, team app), CSS class and icon name (js/lib/dom.js).
   The database only accepts these letters in menu_items.tags (see sql/schema.sql). */
export const TAGS = {
  h: { label: 'Halal', cls: 'tag-h', icon: 'halal' },
  v: { label: 'Vegetarian', cls: 'tag-v', icon: 'leaf' },
  m: { label: 'Meat', cls: 'tag-m', icon: 'cow' },
  c: { label: 'Poultry', cls: 'tag-c', icon: 'drumstick' },
  f: { label: 'Fish & seafood', cls: 'tag-f', icon: 'fish' },
  g: { label: 'Gluten', cls: 'tag-g', icon: 'wheat' },
  s: { label: 'Spicy', cls: 'tag-s', icon: 'chili' }
};

/** The letters of `tags` that are known labels, in display order. */
export const tagList = (tags) => Object.keys(TAGS).filter((t) => String(tags || '').includes(t));

/** The built-in menu in the same shape as the database rows. */
export const builtInMenu = () => MENU.map((cat) => ({
  ...cat,
  items: cat.items.map(([name, price, photo, ingredients, tags, description]) => ({
    name, price, ingredients, tags, description, picture: '🍽️', photo_url: photo ? `images/menu/${photo}.webp` : null
  }))
}));

/** Lower-cased dish name → repo photo path, so database rows without an uploaded photo still get a picture. */
export const PHOTO_BY_NAME = new Map(
  MENU.flatMap((cat) => cat.items).filter(([, , photo]) => photo).map(([name, , photo]) => [name.toLowerCase(), `images/menu/${photo}.webp`])
);

/** Lower-cased dish name → built-in description, for database rows that have none yet. */
export const DESCRIPTION_BY_NAME = new Map(
  MENU.flatMap((cat) => cat.items).map(([name, , , , , description]) => [name.toLowerCase(), description || ''])
);
