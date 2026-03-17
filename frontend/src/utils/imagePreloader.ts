/**
 * Image preloader utility for batch loading driver images
 */

const getImageExtension = (year: number): string => {
  if (year >= 2025) return "avif";
  if (year >= 2022) return "png";
  return "jpg";
};

const IMAGE_EXTENSIONS = ['avif', 'png', 'webp', 'jpg'];

/** Preload an image, trying multiple extensions until one succeeds. */
const preloadImageWithFallback = (basePath: string): Promise<void> => {
  return new Promise((resolve) => {
    let idx = 0;
    const tryNext = () => {
      if (idx >= IMAGE_EXTENSIONS.length) { resolve(); return; }
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => { idx++; tryNext(); };
      img.src = `${basePath}.${IMAGE_EXTENSIONS[idx]}`;
    };
    tryNext();
  });
};

const preloadImage = (src: string): Promise<void> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
};

/**
 * Preload all driver images for a given year
 * Loads driver photos and number images in parallel
 */
export const preloadDriverImages = async (
  drivers: { code: string; carNumber: string }[],
  year: number,
): Promise<void> => {
  const ext = getImageExtension(year);

  const preloadPromises = drivers.flatMap(({ code, carNumber }) => [
    // Preload driver photo
    preloadImage(`/images/drivers/${year}/${code.toUpperCase()}.${ext}`),
    // Preload driver number image (try all extensions)
    preloadImageWithFallback(`/images/numbers/${year}/${carNumber}`),
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
