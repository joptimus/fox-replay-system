/**
 * Image preloader utility for batch loading driver images
 */

const getImageExtension = (year: number): string => {
  if (year >= 2025) return "avif";
  if (year >= 2022) return "png";
  return "jpg";
};

const preloadImage = (src: string): Promise<void> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve(); // Treat errors as success to not block preloading
    img.src = src;
  });
};

/**
 * Preload all driver images for a given year
 * Loads driver photos and number images in parallel
 */
export const preloadDriverImages = async (drivers: string[], year: number): Promise<void> => {
  const ext = getImageExtension(year);
  const numberExt = year >= 2025 ? "avif" : "png";

  const preloadPromises = drivers.flatMap((code) => [
    // Preload driver photo
    preloadImage(`/images/drivers/${year}/${code.toUpperCase()}.${ext}`),
    // Preload driver number
    preloadImage(`/images/numbers/${year}/${code}.${numberExt}`),
  ]);

  await Promise.all(preloadPromises);
};

/**
 * Preload team logos for all teams
 */
export const preloadTeamLogos = (): Promise<void> => {
  const teams = [
    "alpine_small_white.avif",
    "astonmartin_small_white.avif",
    "ferrari_small_white.avif",
    "haas_small_white.avif",
    "kicksauber_small_white.avif",
    "mclaren_small_white.avif",
    "mercedes_small_white.avif",
    "racingbulls_small_white.avif",
    "redbullracing_small_white.avif",
    "williams_small_white.avif",
  ];

  const preloadPromises = teams.map((team) =>
    preloadImage(`/images/team-logos/${team}`)
  );

  return Promise.all(preloadPromises).then(() => {});
};

/**
 * Preload tyre compound icons (all 5 compounds)
 */
export const preloadTyreIcons = (): Promise<void> => {
  const tyrePaths = [0, 1, 2, 3, 4].map((i) => `/images/tyres/${i}.0.png`);
  const preloadPromises = tyrePaths.map((path) => preloadImage(path));
  return Promise.all(preloadPromises).then(() => {});
};

/**
 * Preload all commonly used images
 */
export const preloadCommonImages = (): Promise<void> => {
  const commonPaths = [
    "/images/fia/safetycar.png",
    "/images/drivers/PLACEHOLDER.png",
    "/images/numbers/PLACEHOLDER.png",
  ];

  const preloadPromises = commonPaths.map((path) => preloadImage(path));
  return Promise.all(preloadPromises).then(() => {});
};
