/* ===== Built-in copy of the menu =====
   The live menu is edited by the team in the team app (Menu tab) and stored in the database.
   This copy is only shown if the database cannot be reached.
   Each dish: [name, price USD, picture, ingredients, tags]
   picture : a photo path such as 'images/menu/steak-frites.jpg', or an emoji until you have the photo
   tags    : h = halal meat · v = vegetarian · s = spicy
   The menu is 100% pork-free and alcohol-free — keep it that way when adding dishes.        */
const MENU = [
  { id: 'mezza', name: 'Mezza', note: 'Small plates to share — French classics with a Beirut accent', tint: '#efe4cf', items: [
    ['Hummus à l\'huile de truffe', 7, '🫘', 'Chickpeas, tahini, lemon, garlic, black truffle oil, olive oil', 'v'],
    ['Moutabal fumé', 7, '🍆', 'Charred aubergine, tahini, lemon, garlic, pomegranate, parsley', 'v'],
    ['Taboulé', 6, '🥗', 'Parsley, mint, bulgur, tomato, spring onion, lemon, olive oil', 'v'],
    ['Fattoush', 7, '🥬', 'Romaine, radish, cucumber, tomato, sumac, toasted pita, pomegranate molasses', 'v'],
    ['Rillettes de poulet', 9, '🍗', 'Slow-cooked chicken, butter, thyme, shallot, cornichons, toasted baguette', 'h'],
    ['Gougères au gruyère', 8, '🧀', 'Choux pastry, gruyère, butter, egg, nutmeg', 'v'],
    ['Pâté de campagne (beef & chicken)', 10, '🥖', 'Beef, chicken liver, shallot, black pepper, cornichons, Dijon', 'h'],
    ['Warda — mini croque bites', 9, '🥪', 'Brioche, smoked beef, béchamel, emmental', 'h'],
    ['Labneh aux herbes de Provence', 6, '🥣', 'Strained yoghurt, herbes de Provence, olive oil, za\'atar crisps', 'v'],
    ['Kebbé croustillant', 9, '🧆', 'Bulgur shell, minced beef, onion, pine nuts, seven spices, yoghurt dip', 'h'],
    ['Escargots au beurre persillé', 13, '🐌', 'Burgundy snails, garlic butter, parsley, shallot, baguette', ''],
    ['Batata harra', 6, '🥔', 'Crispy potatoes, garlic, coriander, chilli, lemon', 'vs'],
    ['Olives & marinated feta', 6, '🫒', 'Green and black olives, feta, orange zest, thyme, chilli flakes', 'v']
  ]},
  { id: 'starters', name: 'Starters & Salads', note: 'Entrées and fresh salads', tint: '#e6ead6', items: [
    ['Soupe à l\'oignon gratinée', 10, '🍲', 'Caramelised onions, beef broth, thyme, baguette crouton, melted gruyère', 'h'],
    ['Salade niçoise', 14, '🥗', 'Tuna, green beans, potato, egg, olives, tomato, anchovy, Dijon vinaigrette', ''],
    ['Salade de chèvre chaud', 13, '🧀', 'Warm goat cheese toasts, mesclun, walnuts, honey, balsamic', 'v'],
    ['Salade César au poulet', 13, '🥬', 'Grilled chicken, romaine, parmesan, croutons, Caesar dressing', 'h'],
    ['Velouté de potiron', 9, '🎃', 'Pumpkin, cream, nutmeg, toasted seeds, chive oil', 'v'],
    ['Œufs mimosa', 8, '🥚', 'Eggs, mayonnaise, Dijon mustard, chives, paprika', 'v'],
    ['Tartare de saumon', 16, '🐟', 'Fresh salmon, shallot, capers, dill, lime, avocado', ''],
    ['Carpaccio de bœuf', 15, '🥩', 'Thin-sliced beef fillet, rocket, parmesan, capers, lemon olive oil', 'h'],
    ['Quiche au bœuf fumé', 11, '🥧', 'Shortcrust, eggs, cream, smoked beef, gruyère', 'h'],
    ['Soupe de poisson', 12, '🍜', 'Rockfish soup, saffron, rouille, croutons, gruyère', ''],
    ['Salade lyonnaise au bœuf fumé', 13, '🥗', 'Frisée, poached egg, crispy smoked beef strips, croutons, warm vinaigrette', 'h'],
    ['Burrata & tomates anciennes', 15, '🍅', 'Burrata, heirloom tomatoes, basil, olive oil, fleur de sel', 'v']
  ]},
  { id: 'mains', name: 'Main Course', note: 'Plats principaux', tint: '#ecd9d2', items: [
    ['Steak frites, sauce au poivre', 28, '🥩', 'Beef entrecôte, hand-cut fries, green peppercorn sauce, salad', 'h'],
    ['Bœuf braisé à la bourguignonne', 26, '🫕', 'Beef slow-braised in beef stock and red grape juice, mushrooms, pearl onions, carrots, mashed potato', 'h'],
    ['Poulet rôti à la française', 22, '🍗', 'Half roast chicken, thyme, garlic, jus, gratin dauphinois', 'h'],
    ['Poulet à la crème et aux champignons', 24, '🐓', 'Chicken thighs, mushrooms, cream, shallots, tarragon, tagliatelle', 'h'],
    ['Filet de saumon, beurre blanc', 27, '🐟', 'Salmon fillet, beurre blanc, spinach, crushed potatoes', ''],
    ['Magret de canard à l\'orange', 30, '🦆', 'Duck breast, orange sauce, potato fondant, green beans', ''],
    ['Bouillabaisse', 32, '🦐', 'Mediterranean fish & seafood stew, saffron, fennel, rouille, croutons', ''],
    ['Blanquette de veau', 27, '🍖', 'Veal in creamy white sauce, carrots, mushrooms, rice pilaf', 'h'],
    ['Hachis Parmentier', 19, '🥘', 'Minced beef, onion, thyme, mashed potato gratin, side salad', 'h'],
    ['Moules marinières', 23, '🦪', 'Mussels, garlic, shallots, parsley, cream, lemon, fries', ''],
    ['Ratatouille provençale', 17, '🫑', 'Aubergine, courgette, peppers, tomato, herbs de Provence, rice', 'v'],
    ['Filet mignon, sauce morilles', 36, '🍄', 'Beef tenderloin, morel cream sauce, pommes purée, asparagus', 'h'],
    ['Croziflette au poulet', 21, '🧀', 'Buckwheat pasta, reblochon cheese, chicken, onions, cream', 'h']
  ]},
  { id: 'sandwiches', name: 'Sandwiches', note: 'Served with fries or salad', tint: '#f0e2c4', items: [
    ['Croque-monsieur au bœuf fumé', 12, '🥪', 'Pain de mie, smoked beef, béchamel, gruyère, Dijon', 'h'],
    ['Croque-madame', 13, '🍳', 'Croque-monsieur topped with a fried egg', 'h'],
    ['Baguette bœuf fumé-beurre', 10, '🥖', 'Baguette, salted butter, smoked beef, cornichons', 'h'],
    ['Poulet Dijonnais', 12, '🐔', 'Baguette, grilled chicken, Dijon mayonnaise, lettuce, tomato', 'h'],
    ['Steak-baguette', 15, '🥩', 'Baguette, sliced entrecôte, caramelised onions, Café de Paris butter', 'h'],
    ['Saumon fumé & crème', 14, '🐟', 'Pain de seigle, smoked salmon, herb cream cheese, capers, dill', ''],
    ['Pan bagnat', 12, '🥯', 'Round bread, tuna, egg, olives, tomato, peppers, olive oil', ''],
    ['Le Végétarien', 11, '🥒', 'Ciabatta, grilled vegetables, goat cheese, pesto, rocket', 'v'],
    ['Burger Maison', 16, '🍔', 'Beef patty, brioche bun, comté, caramelised onions, sauce maison', 'h'],
    ['Chicken Caesar wrap', 12, '🌯', 'Tortilla, grilled chicken, romaine, parmesan, Caesar dressing', 'h'],
    ['Croissant poulet-avocat', 12, '🥐', 'Butter croissant, chicken, avocado, lettuce, lemon mayo', 'h'],
    ['Merguez-frites', 13, '🌭', 'Baguette, spicy beef merguez, harissa mayo, fries inside', 'hs']
  ]},
  { id: 'desserts', name: 'Desserts', note: 'Pâtisserie maison', tint: '#f2dfe0', items: [
    ['Crème brûlée à la vanille', 8, '🍮', 'Cream, egg yolks, Madagascar vanilla, caramelised sugar', 'v'],
    ['Tarte Tatin', 9, '🍎', 'Caramelised apples, puff pastry, crème fraîche', 'v'],
    ['Mousse au chocolat', 8, '🍫', 'Dark chocolate, eggs, sugar, sea salt', 'v'],
    ['Profiteroles', 10, '🍨', 'Choux buns, vanilla ice cream, warm chocolate sauce, almonds', 'v'],
    ['Crêpe Suzette (alcohol-free)', 9, '🥞', 'Crêpes, orange butter sauce, orange zest, sugar', 'v'],
    ['Île flottante', 8, '☁️', 'Poached meringue, crème anglaise, caramel, pralines', 'v'],
    ['Éclair au café', 6, '🥖', 'Choux pastry, coffee cream, coffee glaze', 'v'],
    ['Macarons (box of 6)', 12, '🍬', 'Almond meringue shells, ganache: pistachio, raspberry, chocolate, vanilla, lemon, rose', 'v'],
    ['Mille-feuille', 9, '🍰', 'Puff pastry, vanilla pastry cream, icing', 'v'],
    ['Fondant au chocolat', 10, '🧁', 'Molten chocolate cake, vanilla ice cream', 'v'],
    ['Tarte au citron meringuée', 8, '🍋', 'Shortcrust, lemon curd, torched meringue', 'v'],
    ['Paris-Brest', 10, '🍩', 'Choux ring, praliné hazelnut cream, flaked almonds', 'v'],
    ['Halawet el jeben à la française', 9, '🌸', 'Semolina-cheese rolls, ashta cream, rose syrup, pistachio', 'v']
  ]},
  { id: 'soft', name: 'Soft Drinks', note: 'Chilled bottles and cans', tint: '#dfe8ec', items: [
    ['Coca-Cola', 3, '🥤', 'Carbonated water, sugar, caramel colour, natural flavours, caffeine', 'v'],
    ['Coca-Cola Zero', 3, '🥤', 'Carbonated water, sweeteners, natural flavours, caffeine', 'v'],
    ['Pepsi', 3, '🥤', 'Carbonated water, sugar, caramel colour, flavours, caffeine', 'v'],
    ['7UP', 3, '🫧', 'Carbonated water, sugar, lemon-lime flavour', 'v'],
    ['Orangina', 4, '🍊', 'Sparkling water, orange juice, orange pulp, sugar', 'v'],
    ['Schweppes Tonic', 3, '🫧', 'Carbonated water, sugar, quinine, citrus extract', 'v'],
    ['Perrier', 4, '💧', 'Sparkling natural mineral water', 'v'],
    ['Evian (75cl)', 5, '💧', 'Still natural mineral water', 'v'],
    ['Sohat (local still water)', 2, '💧', 'Still Lebanese spring water', 'v'],
    ['Ginger ale', 3, '🫚', 'Carbonated water, sugar, ginger extract', 'v'],
    ['Red Bull', 5, '⚡', 'Carbonated water, sugar, taurine, caffeine, B vitamins', 'v'],
    ['Laban ayran', 3, '🥛', 'Yoghurt, water, salt, mint', 'v']
  ]},
  { id: 'hot', name: 'Hot Drinks', note: 'Coffee, tea and more', tint: '#e8dccd', items: [
    ['Espresso', 3, '☕', 'Single shot of Arabica espresso', 'v'],
    ['Café crème', 4, '☕', 'Espresso, steamed milk, milk foam', 'v'],
    ['Cappuccino', 5, '☕', 'Espresso, steamed milk, thick foam, cocoa', 'v'],
    ['Café latte', 5, '🥛', 'Espresso, plenty of steamed milk', 'v'],
    ['Café turc (Lebanese coffee)', 3, '🫖', 'Finely ground coffee, cardamom, sugar on request', 'v'],
    ['Chocolat chaud à l\'ancienne', 6, '🍫', 'Dark chocolate melted in whole milk, whipped cream', 'v'],
    ['Thé à la menthe', 4, '🌿', 'Green tea, fresh mint, sugar on request', 'v'],
    ['Earl Grey', 4, '🫖', 'Black tea, bergamot', 'v'],
    ['Camomille', 4, '🌼', 'Chamomile flowers', 'v'],
    ['Verveine', 4, '🌱', 'Lemon verbena leaves', 'v'],
    ['Chai latte', 5, '🍂', 'Black tea, cinnamon, cardamom, ginger, steamed milk', 'v'],
    ['Café viennois', 6, '☕', 'Espresso, hot water, whipped cream, chocolate shavings', 'v']
  ]},
  { id: 'cold', name: 'Cold Drinks', note: 'Fresh juices, iced coffee and mocktails', tint: '#d9e6e0', items: [
    ['Citronnade maison', 5, '🍋', 'Fresh lemon, mint, sugar, sparkling or still water', 'v'],
    ['Jus d\'orange pressé', 6, '🍊', 'Freshly squeezed oranges', 'v'],
    ['Jus de carotte', 5, '🥕', 'Fresh carrots, a touch of orange', 'v'],
    ['Cocktail de fruits', 7, '🍓', 'Strawberry, banana, mango, avocado, ashta, honey', 'v'],
    ['Iced latte', 5, '🧊', 'Espresso, cold milk, ice', 'v'],
    ['Café frappé', 6, '🥤', 'Espresso, milk, vanilla, ice, whipped cream', 'v'],
    ['Thé glacé pêche', 5, '🍑', 'Black tea, peach, lemon, ice', 'v'],
    ['Virgin mojito', 6, '🌿', 'Lime, mint, sugar, soda water, crushed ice (no alcohol)', 'v'],
    ['Diabolo menthe', 4, '🫧', 'Lemonade, mint syrup', 'v'],
    ['Smoothie fruits rouges', 7, '🫐', 'Strawberry, raspberry, blueberry, yoghurt, honey', 'v'],
    ['Milkshake vanille', 6, '🥛', 'Vanilla ice cream, milk, whipped cream', 'v'],
    ['Jallab', 5, '🍇', 'Grape molasses, date syrup, rose water, pine nuts, raisins', 'v'],
    ['Limonade à la rose', 5, '🌹', 'Lemon, rose water, sugar, sparkling water', 'v']
  ]}
];

const TAGS = {
  h: ['Halal', 'tag-h'],
  v: ['Vegetarian', 'tag-v'],
  s: ['Spicy', 'tag-s']
};
