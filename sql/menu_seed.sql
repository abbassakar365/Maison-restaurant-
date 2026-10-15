-- First menu, copied from js/menu.js (only if the menu tables are empty)
do $$ begin
if exists (select 1 from public.menu_categories) then return; end if;
insert into public.menu_categories (id, name, note, tint, sort) values ('mezza', 'Mezza', 'Small plates to share — French classics with a Beirut accent', '#efe4cf', 1);
insert into public.menu_items (category_id, name, price, picture, ingredients, tags, sort) values
  ('mezza', 'Hummus à l''huile de truffe', 7, '🫘', 'Chickpeas, tahini, lemon, garlic, black truffle oil, olive oil', 'v', 1),
  ('mezza', 'Moutabal fumé', 7, '🍆', 'Charred aubergine, tahini, lemon, garlic, pomegranate, parsley', 'v', 2),
  ('mezza', 'Taboulé', 6, '🥗', 'Parsley, mint, bulgur, tomato, spring onion, lemon, olive oil', 'v', 3),
  ('mezza', 'Fattoush', 7, '🥬', 'Romaine, radish, cucumber, tomato, sumac, toasted pita, pomegranate molasses', 'v', 4),
  ('mezza', 'Rillettes de poulet', 9, '🍗', 'Slow-cooked chicken, butter, thyme, shallot, cornichons, toasted baguette', 'h', 5),
  ('mezza', 'Gougères au gruyère', 8, '🧀', 'Choux pastry, gruyère, butter, egg, nutmeg', 'v', 6),
  ('mezza', 'Pâté de campagne (beef & chicken)', 10, '🥖', 'Beef, chicken liver, shallot, black pepper, cornichons, Dijon', 'h', 7),
  ('mezza', 'Warda — mini croque bites', 9, '🥪', 'Brioche, smoked beef, béchamel, emmental', 'h', 8),
  ('mezza', 'Labneh aux herbes de Provence', 6, '🥣', 'Strained yoghurt, herbes de Provence, olive oil, za''atar crisps', 'v', 9),
  ('mezza', 'Kebbé croustillant', 9, '🧆', 'Bulgur shell, minced beef, onion, pine nuts, seven spices, yoghurt dip', 'h', 10),
  ('mezza', 'Escargots au beurre persillé', 13, '🐌', 'Burgundy snails, garlic butter, parsley, shallot, baguette', '', 11),
  ('mezza', 'Batata harra', 6, '🥔', 'Crispy potatoes, garlic, coriander, chilli, lemon', 'vs', 12),
  ('mezza', 'Olives & marinated feta', 6, '🫒', 'Green and black olives, feta, orange zest, thyme, chilli flakes', 'v', 13);
insert into public.menu_categories (id, name, note, tint, sort) values ('starters', 'Starters & Salads', 'Entrées and fresh salads', '#e6ead6', 2);
insert into public.menu_items (category_id, name, price, picture, ingredients, tags, sort) values
  ('starters', 'Soupe à l''oignon gratinée', 10, '🍲', 'Caramelised onions, beef broth, thyme, baguette crouton, melted gruyère', 'h', 1),
  ('starters', 'Salade niçoise', 14, '🥗', 'Tuna, green beans, potato, egg, olives, tomato, anchovy, Dijon vinaigrette', '', 2),
  ('starters', 'Salade de chèvre chaud', 13, '🧀', 'Warm goat cheese toasts, mesclun, walnuts, honey, balsamic', 'v', 3),
  ('starters', 'Salade César au poulet', 13, '🥬', 'Grilled chicken, romaine, parmesan, croutons, Caesar dressing', 'h', 4),
  ('starters', 'Velouté de potiron', 9, '🎃', 'Pumpkin, cream, nutmeg, toasted seeds, chive oil', 'v', 5),
  ('starters', 'Œufs mimosa', 8, '🥚', 'Eggs, mayonnaise, Dijon mustard, chives, paprika', 'v', 6),
  ('starters', 'Tartare de saumon', 16, '🐟', 'Fresh salmon, shallot, capers, dill, lime, avocado', '', 7),
  ('starters', 'Carpaccio de bœuf', 15, '🥩', 'Thin-sliced beef fillet, rocket, parmesan, capers, lemon olive oil', 'h', 8),
  ('starters', 'Quiche au bœuf fumé', 11, '🥧', 'Shortcrust, eggs, cream, smoked beef, gruyère', 'h', 9),
  ('starters', 'Soupe de poisson', 12, '🍜', 'Rockfish soup, saffron, rouille, croutons, gruyère', '', 10),
  ('starters', 'Salade lyonnaise au bœuf fumé', 13, '🥗', 'Frisée, poached egg, crispy smoked beef strips, croutons, warm vinaigrette', 'h', 11),
  ('starters', 'Burrata & tomates anciennes', 15, '🍅', 'Burrata, heirloom tomatoes, basil, olive oil, fleur de sel', 'v', 12);
insert into public.menu_categories (id, name, note, tint, sort) values ('mains', 'Main Course', 'Plats principaux', '#ecd9d2', 3);
insert into public.menu_items (category_id, name, price, picture, ingredients, tags, sort) values
  ('mains', 'Steak frites, sauce au poivre', 28, '🥩', 'Beef entrecôte, hand-cut fries, green peppercorn sauce, salad', 'h', 1),
  ('mains', 'Bœuf braisé à la bourguignonne', 26, '🫕', 'Beef slow-braised in beef stock and red grape juice, mushrooms, pearl onions, carrots, mashed potato', 'h', 2),
  ('mains', 'Poulet rôti à la française', 22, '🍗', 'Half roast chicken, thyme, garlic, jus, gratin dauphinois', 'h', 3),
  ('mains', 'Poulet à la crème et aux champignons', 24, '🐓', 'Chicken thighs, mushrooms, cream, shallots, tarragon, tagliatelle', 'h', 4),
  ('mains', 'Filet de saumon, beurre blanc', 27, '🐟', 'Salmon fillet, beurre blanc, spinach, crushed potatoes', '', 5),
  ('mains', 'Magret de canard à l''orange', 30, '🦆', 'Duck breast, orange sauce, potato fondant, green beans', '', 6),
  ('mains', 'Bouillabaisse', 32, '🦐', 'Mediterranean fish & seafood stew, saffron, fennel, rouille, croutons', '', 7),
  ('mains', 'Blanquette de veau', 27, '🍖', 'Veal in creamy white sauce, carrots, mushrooms, rice pilaf', 'h', 8),
  ('mains', 'Hachis Parmentier', 19, '🥘', 'Minced beef, onion, thyme, mashed potato gratin, side salad', 'h', 9),
  ('mains', 'Moules marinières', 23, '🦪', 'Mussels, garlic, shallots, parsley, cream, lemon, fries', '', 10),
  ('mains', 'Ratatouille provençale', 17, '🫑', 'Aubergine, courgette, peppers, tomato, herbs de Provence, rice', 'v', 11),
  ('mains', 'Filet mignon, sauce morilles', 36, '🍄', 'Beef tenderloin, morel cream sauce, pommes purée, asparagus', 'h', 12),
  ('mains', 'Croziflette au poulet', 21, '🧀', 'Buckwheat pasta, reblochon cheese, chicken, onions, cream', 'h', 13);
insert into public.menu_categories (id, name, note, tint, sort) values ('sandwiches', 'Sandwiches', 'Served with fries or salad', '#f0e2c4', 4);
insert into public.menu_items (category_id, name, price, picture, ingredients, tags, sort) values
  ('sandwiches', 'Croque-monsieur au bœuf fumé', 12, '🥪', 'Pain de mie, smoked beef, béchamel, gruyère, Dijon', 'h', 1),
  ('sandwiches', 'Croque-madame', 13, '🍳', 'Croque-monsieur topped with a fried egg', 'h', 2),
  ('sandwiches', 'Baguette bœuf fumé-beurre', 10, '🥖', 'Baguette, salted butter, smoked beef, cornichons', 'h', 3),
  ('sandwiches', 'Poulet Dijonnais', 12, '🐔', 'Baguette, grilled chicken, Dijon mayonnaise, lettuce, tomato', 'h', 4),
  ('sandwiches', 'Steak-baguette', 15, '🥩', 'Baguette, sliced entrecôte, caramelised onions, Café de Paris butter', 'h', 5),
  ('sandwiches', 'Saumon fumé & crème', 14, '🐟', 'Pain de seigle, smoked salmon, herb cream cheese, capers, dill', '', 6),
  ('sandwiches', 'Pan bagnat', 12, '🥯', 'Round bread, tuna, egg, olives, tomato, peppers, olive oil', '', 7),
  ('sandwiches', 'Le Végétarien', 11, '🥒', 'Ciabatta, grilled vegetables, goat cheese, pesto, rocket', 'v', 8),
  ('sandwiches', 'Burger Maison', 16, '🍔', 'Beef patty, brioche bun, comté, caramelised onions, sauce maison', 'h', 9),
  ('sandwiches', 'Chicken Caesar wrap', 12, '🌯', 'Tortilla, grilled chicken, romaine, parmesan, Caesar dressing', 'h', 10),
  ('sandwiches', 'Croissant poulet-avocat', 12, '🥐', 'Butter croissant, chicken, avocado, lettuce, lemon mayo', 'h', 11),
  ('sandwiches', 'Merguez-frites', 13, '🌭', 'Baguette, spicy beef merguez, harissa mayo, fries inside', 'hs', 12);
insert into public.menu_categories (id, name, note, tint, sort) values ('desserts', 'Desserts', 'Pâtisserie maison', '#f2dfe0', 5);
insert into public.menu_items (category_id, name, price, picture, ingredients, tags, sort) values
  ('desserts', 'Crème brûlée à la vanille', 8, '🍮', 'Cream, egg yolks, Madagascar vanilla, caramelised sugar', 'v', 1),
  ('desserts', 'Tarte Tatin', 9, '🍎', 'Caramelised apples, puff pastry, crème fraîche', 'v', 2),
  ('desserts', 'Mousse au chocolat', 8, '🍫', 'Dark chocolate, eggs, sugar, sea salt', 'v', 3),
  ('desserts', 'Profiteroles', 10, '🍨', 'Choux buns, vanilla ice cream, warm chocolate sauce, almonds', 'v', 4),
  ('desserts', 'Crêpe Suzette (alcohol-free)', 9, '🥞', 'Crêpes, orange butter sauce, orange zest, sugar', 'v', 5),
  ('desserts', 'Île flottante', 8, '☁️', 'Poached meringue, crème anglaise, caramel, pralines', 'v', 6),
  ('desserts', 'Éclair au café', 6, '🥖', 'Choux pastry, coffee cream, coffee glaze', 'v', 7),
  ('desserts', 'Macarons (box of 6)', 12, '🍬', 'Almond meringue shells, ganache: pistachio, raspberry, chocolate, vanilla, lemon, rose', 'v', 8),
  ('desserts', 'Mille-feuille', 9, '🍰', 'Puff pastry, vanilla pastry cream, icing', 'v', 9),
  ('desserts', 'Fondant au chocolat', 10, '🧁', 'Molten chocolate cake, vanilla ice cream', 'v', 10),
  ('desserts', 'Tarte au citron meringuée', 8, '🍋', 'Shortcrust, lemon curd, torched meringue', 'v', 11),
  ('desserts', 'Paris-Brest', 10, '🍩', 'Choux ring, praliné hazelnut cream, flaked almonds', 'v', 12),
  ('desserts', 'Halawet el jeben à la française', 9, '🌸', 'Semolina-cheese rolls, ashta cream, rose syrup, pistachio', 'v', 13);
insert into public.menu_categories (id, name, note, tint, sort) values ('soft', 'Soft Drinks', 'Chilled bottles and cans', '#dfe8ec', 6);
insert into public.menu_items (category_id, name, price, picture, ingredients, tags, sort) values
  ('soft', 'Coca-Cola', 3, '🥤', 'Carbonated water, sugar, caramel colour, natural flavours, caffeine', 'v', 1),
  ('soft', 'Coca-Cola Zero', 3, '🥤', 'Carbonated water, sweeteners, natural flavours, caffeine', 'v', 2),
  ('soft', 'Pepsi', 3, '🥤', 'Carbonated water, sugar, caramel colour, flavours, caffeine', 'v', 3),
  ('soft', '7UP', 3, '🫧', 'Carbonated water, sugar, lemon-lime flavour', 'v', 4),
  ('soft', 'Orangina', 4, '🍊', 'Sparkling water, orange juice, orange pulp, sugar', 'v', 5),
  ('soft', 'Schweppes Tonic', 3, '🫧', 'Carbonated water, sugar, quinine, citrus extract', 'v', 6),
  ('soft', 'Perrier', 4, '💧', 'Sparkling natural mineral water', 'v', 7),
  ('soft', 'Evian (75cl)', 5, '💧', 'Still natural mineral water', 'v', 8),
  ('soft', 'Sohat (local still water)', 2, '💧', 'Still Lebanese spring water', 'v', 9),
  ('soft', 'Ginger ale', 3, '🫚', 'Carbonated water, sugar, ginger extract', 'v', 10),
  ('soft', 'Red Bull', 5, '⚡', 'Carbonated water, sugar, taurine, caffeine, B vitamins', 'v', 11),
  ('soft', 'Laban ayran', 3, '🥛', 'Yoghurt, water, salt, mint', 'v', 12);
insert into public.menu_categories (id, name, note, tint, sort) values ('hot', 'Hot Drinks', 'Coffee, tea and more', '#e8dccd', 7);
insert into public.menu_items (category_id, name, price, picture, ingredients, tags, sort) values
  ('hot', 'Espresso', 3, '☕', 'Single shot of Arabica espresso', 'v', 1),
  ('hot', 'Café crème', 4, '☕', 'Espresso, steamed milk, milk foam', 'v', 2),
  ('hot', 'Cappuccino', 5, '☕', 'Espresso, steamed milk, thick foam, cocoa', 'v', 3),
  ('hot', 'Café latte', 5, '🥛', 'Espresso, plenty of steamed milk', 'v', 4),
  ('hot', 'Café turc (Lebanese coffee)', 3, '🫖', 'Finely ground coffee, cardamom, sugar on request', 'v', 5),
  ('hot', 'Chocolat chaud à l''ancienne', 6, '🍫', 'Dark chocolate melted in whole milk, whipped cream', 'v', 6),
  ('hot', 'Thé à la menthe', 4, '🌿', 'Green tea, fresh mint, sugar on request', 'v', 7),
  ('hot', 'Earl Grey', 4, '🫖', 'Black tea, bergamot', 'v', 8),
  ('hot', 'Camomille', 4, '🌼', 'Chamomile flowers', 'v', 9),
  ('hot', 'Verveine', 4, '🌱', 'Lemon verbena leaves', 'v', 10),
  ('hot', 'Chai latte', 5, '🍂', 'Black tea, cinnamon, cardamom, ginger, steamed milk', 'v', 11),
  ('hot', 'Café viennois', 6, '☕', 'Espresso, hot water, whipped cream, chocolate shavings', 'v', 12);
insert into public.menu_categories (id, name, note, tint, sort) values ('cold', 'Cold Drinks', 'Fresh juices, iced coffee and mocktails', '#d9e6e0', 8);
insert into public.menu_items (category_id, name, price, picture, ingredients, tags, sort) values
  ('cold', 'Citronnade maison', 5, '🍋', 'Fresh lemon, mint, sugar, sparkling or still water', 'v', 1),
  ('cold', 'Jus d''orange pressé', 6, '🍊', 'Freshly squeezed oranges', 'v', 2),
  ('cold', 'Jus de carotte', 5, '🥕', 'Fresh carrots, a touch of orange', 'v', 3),
  ('cold', 'Cocktail de fruits', 7, '🍓', 'Strawberry, banana, mango, avocado, ashta, honey', 'v', 4),
  ('cold', 'Iced latte', 5, '🧊', 'Espresso, cold milk, ice', 'v', 5),
  ('cold', 'Café frappé', 6, '🥤', 'Espresso, milk, vanilla, ice, whipped cream', 'v', 6),
  ('cold', 'Thé glacé pêche', 5, '🍑', 'Black tea, peach, lemon, ice', 'v', 7),
  ('cold', 'Virgin mojito', 6, '🌿', 'Lime, mint, sugar, soda water, crushed ice (no alcohol)', 'v', 8),
  ('cold', 'Diabolo menthe', 4, '🫧', 'Lemonade, mint syrup', 'v', 9),
  ('cold', 'Smoothie fruits rouges', 7, '🫐', 'Strawberry, raspberry, blueberry, yoghurt, honey', 'v', 10),
  ('cold', 'Milkshake vanille', 6, '🥛', 'Vanilla ice cream, milk, whipped cream', 'v', 11),
  ('cold', 'Jallab', 5, '🍇', 'Grape molasses, date syrup, rose water, pine nuts, raisins', 'v', 12),
  ('cold', 'Limonade à la rose', 5, '🌹', 'Lemon, rose water, sugar, sparkling water', 'v', 13);
end $$;
