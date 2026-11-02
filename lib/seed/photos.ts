// The seed photos (SPEC §10, DECISIONS #77): which Pixabay photo fills each item's photo
// slot, and who took it. CREDITS.md lists the same photos (a unit test keeps them in step).
// The image files never go in git: the deployed site reads them from Blob, and local dev
// from gitignored copies in public/seed/. Files and Blob pathnames both use the key.

export interface SeedPhoto {
  slug: string;
  /** 1-based position in the item's gallery. */
  n: number;
  pixabayId: number;
  photographer: string;
  pageUrl: string;
  profileUrl: string;
}

/** The stored form of a seed photo: a relative key, never a URL (DECISIONS #77). */
export const SEED_PHOTO_KEY = /^seed\/[a-z0-9]+(?:-[a-z0-9]+)*-[1-9]\.jpg$/;

export function seedPhotoKey(slug: string, n: number): string {
  const key = `seed/${slug}-${n}.jpg`;
  if (!SEED_PHOTO_KEY.test(key)) throw new Error(`Not a seed photo key: ${key}`);
  return key;
}

export const SEED_PHOTOS: readonly SeedPhoto[] = [
  { slug: "lakeside-cabin-weekend", n: 1, pixabayId: 1921705, photographer: "user32212", pageUrl: "https://pixabay.com/photos/log-home-cabin-hammock-country-1921705/", profileUrl: "https://pixabay.com/users/user32212-763448/" },
  { slug: "lakeside-cabin-weekend", n: 2, pixabayId: 2041017, photographer: "user32212", pageUrl: "https://pixabay.com/photos/rustic-kitchen-logs-log-home-2041017/", profileUrl: "https://pixabay.com/users/user32212-763448/" },
  { slug: "lakeside-cabin-weekend", n: 3, pixabayId: 2225414, photographer: "user32212", pageUrl: "https://pixabay.com/photos/log-home-log-home-bedroom-rustic-2225414/", profileUrl: "https://pixabay.com/users/user32212-763448/" },
  { slug: "lakeside-cabin-weekend", n: 4, pixabayId: 2244057, photographer: "user32212", pageUrl: "https://pixabay.com/photos/mountains-storm-clouds-deck-wood-2244057/", profileUrl: "https://pixabay.com/users/user32212-763448/" },
  { slug: "lakeside-cabin-weekend", n: 5, pixabayId: 2244049, photographer: "user32212", pageUrl: "https://pixabay.com/photos/river-boat-dock-reflection-2244049/", profileUrl: "https://pixabay.com/users/user32212-763448/" },
  { slug: "guitar-lessons", n: 1, pixabayId: 4750599, photographer: "ThorstenF", pageUrl: "https://pixabay.com/photos/guitar-acoustics-strings-music-4750599/", profileUrl: "https://pixabay.com/users/ThorstenF-7677369/" },
  { slug: "guitar-lessons", n: 2, pixabayId: 4750612, photographer: "ThorstenF", pageUrl: "https://pixabay.com/photos/guitar-make-music-music-instrument-4750612/", profileUrl: "https://pixabay.com/users/ThorstenF-7677369/" },
  { slug: "guitar-lessons", n: 3, pixabayId: 4750600, photographer: "ThorstenF", pageUrl: "https://pixabay.com/photos/guitar-neck-handle-chord-music-4750600/", profileUrl: "https://pixabay.com/users/ThorstenF-7677369/" },
  { slug: "pottery-class", n: 1, pixabayId: 4635710, photographer: "marcelkessler", pageUrl: "https://pixabay.com/photos/volume-potters-pottery-hub-rotate-4635710/", profileUrl: "https://pixabay.com/users/marcelkessler-3217273/" },
  { slug: "pottery-class", n: 2, pixabayId: 4635713, photographer: "marcelkessler", pageUrl: "https://pixabay.com/photos/volume-potters-pottery-hub-rotate-4635713/", profileUrl: "https://pixabay.com/users/marcelkessler-3217273/" },
  { slug: "pottery-class", n: 3, pixabayId: 4635712, photographer: "marcelkessler", pageUrl: "https://pixabay.com/photos/volume-potters-pottery-hub-rotate-4635712/", profileUrl: "https://pixabay.com/users/marcelkessler-3217273/" },
  { slug: "hot-sauce-trio", n: 1, pixabayId: 645666, photographer: "jlarbig", pageUrl: "https://pixabay.com/photos/food-dressing-salad-645666/", profileUrl: "https://pixabay.com/users/jlarbig-793862/" },
  { slug: "hot-sauce-trio", n: 2, pixabayId: 645670, photographer: "jlarbig", pageUrl: "https://pixabay.com/photos/food-dressing-salad-645670/", profileUrl: "https://pixabay.com/users/jlarbig-793862/" },
  { slug: "hot-sauce-trio", n: 3, pixabayId: 645671, photographer: "jlarbig", pageUrl: "https://pixabay.com/photos/food-dressing-salad-645671/", profileUrl: "https://pixabay.com/users/jlarbig-793862/" },
  { slug: "sourdough-starter", n: 1, pixabayId: 821503, photographer: "fancycrave1", pageUrl: "https://pixabay.com/photos/bread-baking-fresh-home-made-food-821503/", profileUrl: "https://pixabay.com/users/fancycrave1-1115284/" },
  { slug: "custom-pet-portrait", n: 1, pixabayId: 1219635, photographer: "PeterKraayvanger", pageUrl: "https://pixabay.com/photos/cats-to-paint-painting-artwork-1219635/", profileUrl: "https://pixabay.com/users/PeterKraayvanger-10776/" },
  { slug: "bike-tune-up", n: 1, pixabayId: 5696609, photographer: "rschaubhut", pageUrl: "https://pixabay.com/photos/wheel-bike-rim-technology-valve-5696609/", profileUrl: "https://pixabay.com/users/rschaubhut-11564814/" },
  { slug: "pasta-night", n: 1, pixabayId: 1181189, photographer: "Oldmermaid", pageUrl: "https://pixabay.com/photos/pasta-fettuccine-fresh-pasta-1181189/", profileUrl: "https://pixabay.com/users/Oldmermaid-1999835/" },
  { slug: "vegetable-bed", n: 1, pixabayId: 6151414, photographer: "planet_fox", pageUrl: "https://pixabay.com/photos/plant-hands-gardening-soil-sowing-6151414/", profileUrl: "https://pixabay.com/users/planet_fox-4691618/" },
  { slug: "dog-sitting", n: 1, pixabayId: 4988985, photographer: "lucioliu", pageUrl: "https://pixabay.com/photos/dog-corgi-cute-animal-4988985/", profileUrl: "https://pixabay.com/users/lucioliu-4032922/" },
  { slug: "board-game-night", n: 1, pixabayId: 442544, photographer: "AndreasAux", pageUrl: "https://pixabay.com/photos/dice-to-play-multicoloured-numbers-442544/", profileUrl: "https://pixabay.com/users/AndreasAux-148268/" },
  { slug: "hand-knit-scarf", n: 1, pixabayId: 6678139, photographer: "nonmisvegliate", pageUrl: "https://pixabay.com/photos/scarves-wool-fabric-folded-6678139/", profileUrl: "https://pixabay.com/users/nonmisvegliate-7011191/" },
  { slug: "lemon-squares", n: 1, pixabayId: 4227690, photographer: "Michelle-Maria", pageUrl: "https://pixabay.com/photos/dessert-lemon-meringue-sweet-tart-4227690/", profileUrl: "https://pixabay.com/users/Michelle-Maria-165491/" },
  { slug: "candles", n: 1, pixabayId: 2826332, photographer: "stefannyffenegger", pageUrl: "https://pixabay.com/photos/candlelight-light-wedding-romantic-2826332/", profileUrl: "https://pixabay.com/users/stefannyffenegger-6644995/" },
  { slug: "desk-plant", n: 1, pixabayId: 3816945, photographer: "sweetlouise", pageUrl: "https://pixabay.com/photos/plant-pothos-epipremnum-aureum-3816945/", profileUrl: "https://pixabay.com/users/sweetlouise-3967705/" },
  { slug: "banana-bread", n: 1, pixabayId: 2459926, photographer: "greleht", pageUrl: "https://pixabay.com/photos/bread-banana-food-healthy-homemade-2459926/", profileUrl: "https://pixabay.com/users/greleht-5168740/" },
];
