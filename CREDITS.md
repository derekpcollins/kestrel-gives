# Credits

## Logos

The Kestrel org mark and the Kestrel Gives event mark were designed by me with an image generator. — Derek Collins

- Source files: `design/source/logos/`
- Exports (cropped and resized only, never redrawn or recolored): `public/brand/`, `public/favicon-16.png`, `public/favicon-32.png`, `public/apple-touch-icon.png`

## Fonts

Body, UI, and numbers use the system font stack.

**Plus Jakarta Sans** (headings and the hero lockup)
- Designer: Tokotype. Copyright 2020 The Plus Jakarta Sans Project Authors
- Source: https://github.com/tokotype/PlusJakartaSans, via Google Fonts (https://fonts.google.com/specimen/Plus+Jakarta+Sans). Downloaded once at build time as the variable WOFF2, Latin subset; self-hosted, so the site makes no requests to Google
- License: SIL Open Font License 1.1, checked against `OFL.txt` and `METADATA.pb` in the google/fonts repo. The license travels with the font: `public/fonts/plus-jakarta-sans-OFL.txt`
- File: `public/fonts/plus-jakarta-sans-latin-var.woff2` (unmodified)

## Photos

The 26 seed photos are from [Pixabay](https://pixabay.com/), under the [Pixabay Content License](https://pixabay.com/service/terms/): free to use, attribution not required, but every photo is credited here anyway (SPEC section 10). Downloaded 2026-11-02 at Pixabay’s 1280px size, metadata stripped, and re-encoded as JPEG at about quality 80.

The image files are not in this repo: the license does not allow redistributing photos on their own, and a public repo would do that. The deployed site serves them from its Blob store; local copies are gitignored (DECISIONS #77).

- **Lakeside Cabin Weekend, photo 1** (`seed/lakeside-cabin-weekend-1.jpg`): by [user32212](https://pixabay.com/users/user32212-763448/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/log-home-cabin-hammock-country-1921705/
- **Lakeside Cabin Weekend, photo 2** (`seed/lakeside-cabin-weekend-2.jpg`): by [user32212](https://pixabay.com/users/user32212-763448/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/rustic-kitchen-logs-log-home-2041017/
- **Lakeside Cabin Weekend, photo 3** (`seed/lakeside-cabin-weekend-3.jpg`): by [user32212](https://pixabay.com/users/user32212-763448/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/log-home-log-home-bedroom-rustic-2225414/
- **Lakeside Cabin Weekend, photo 4** (`seed/lakeside-cabin-weekend-4.jpg`): by [user32212](https://pixabay.com/users/user32212-763448/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/mountains-storm-clouds-deck-wood-2244057/
- **Lakeside Cabin Weekend, photo 5** (`seed/lakeside-cabin-weekend-5.jpg`): by [user32212](https://pixabay.com/users/user32212-763448/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/river-boat-dock-reflection-2244049/
- **Guitar lessons, four weeks, photo 1** (`seed/guitar-lessons-1.jpg`): by [ThorstenF](https://pixabay.com/users/ThorstenF-7677369/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/guitar-acoustics-strings-music-4750599/
- **Guitar lessons, four weeks, photo 2** (`seed/guitar-lessons-2.jpg`): by [ThorstenF](https://pixabay.com/users/ThorstenF-7677369/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/guitar-make-music-music-instrument-4750612/
- **Guitar lessons, four weeks, photo 3** (`seed/guitar-lessons-3.jpg`): by [ThorstenF](https://pixabay.com/users/ThorstenF-7677369/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/guitar-neck-handle-chord-music-4750600/
- **Pottery class for two, photo 1** (`seed/pottery-class-1.jpg`): by [marcelkessler](https://pixabay.com/users/marcelkessler-3217273/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/volume-potters-pottery-hub-rotate-4635710/
- **Pottery class for two, photo 2** (`seed/pottery-class-2.jpg`): by [marcelkessler](https://pixabay.com/users/marcelkessler-3217273/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/volume-potters-pottery-hub-rotate-4635713/
- **Pottery class for two, photo 3** (`seed/pottery-class-3.jpg`): by [marcelkessler](https://pixabay.com/users/marcelkessler-3217273/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/volume-potters-pottery-hub-rotate-4635712/
- **Homemade hot sauce trio, photo 1** (`seed/hot-sauce-trio-1.jpg`): by [jlarbig](https://pixabay.com/users/jlarbig-793862/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/food-dressing-salad-645666/
- **Homemade hot sauce trio, photo 2** (`seed/hot-sauce-trio-2.jpg`): by [jlarbig](https://pixabay.com/users/jlarbig-793862/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/food-dressing-salad-645670/
- **Homemade hot sauce trio, photo 3** (`seed/hot-sauce-trio-3.jpg`): by [jlarbig](https://pixabay.com/users/jlarbig-793862/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/food-dressing-salad-645671/
- **Sourdough starter and a loaf a month** (`seed/sourdough-starter-1.jpg`): by [fancycrave1](https://pixabay.com/users/fancycrave1-1115284/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/bread-baking-fresh-home-made-food-821503/
- **Custom pet portrait** (`seed/custom-pet-portrait-1.jpg`): by [PeterKraayvanger](https://pixabay.com/users/PeterKraayvanger-10776/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/cats-to-paint-painting-artwork-1219635/
- **Bike tune-up at your desk** (`seed/bike-tune-up-1.jpg`): by [rschaubhut](https://pixabay.com/users/rschaubhut-11564814/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/wheel-bike-rim-technology-valve-5696609/
- **Homemade pasta night for four** (`seed/pasta-night-1.jpg`): by [Oldmermaid](https://pixabay.com/users/Oldmermaid-1999835/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/pasta-fettuccine-fresh-pasta-1181189/
- **Help planting a vegetable bed** (`seed/vegetable-bed-1.jpg`): by [planet_fox](https://pixabay.com/users/planet_fox-4691618/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/plant-hands-gardening-soil-sowing-6151414/
- **Weekend dog-sitting** (`seed/dog-sitting-1.jpg`): by [lucioliu](https://pixabay.com/users/lucioliu-4032922/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/dog-corgi-cute-animal-4988985/
- **Board game night, hosted** (`seed/board-game-night-1.jpg`): by [AndreasAux](https://pixabay.com/users/AndreasAux-148268/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/dice-to-play-multicoloured-numbers-442544/
- **Hand-knit scarf** (`seed/hand-knit-scarf-1.jpg`): by [nonmisvegliate](https://pixabay.com/users/nonmisvegliate-7011191/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/scarves-wool-fabric-folded-6678139/
- **Lemon squares, a dozen** (`seed/lemon-squares-1.jpg`): by [Michelle-Maria](https://pixabay.com/users/Michelle-Maria-165491/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/dessert-lemon-meringue-sweet-tart-4227690/
- **Hand-poured candles, set of three** (`seed/candles-1.jpg`): by [stefannyffenegger](https://pixabay.com/users/stefannyffenegger-6644995/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/candlelight-light-wedding-romantic-2826332/
- **Desk plant in a hand-glazed pot** (`seed/desk-plant-1.jpg`): by [sweetlouise](https://pixabay.com/users/sweetlouise-3967705/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/plant-pothos-epipremnum-aureum-3816945/
- **Banana bread, two loaves** (`seed/banana-bread-1.jpg`): by [greleht](https://pixabay.com/users/greleht-5168740/) via [Pixabay](https://pixabay.com/). Source: https://pixabay.com/photos/bread-banana-food-healthy-homemade-2459926/
