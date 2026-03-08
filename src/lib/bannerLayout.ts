export const CATALOG_BANNER_ASPECT_RATIO = 4;
export const CATALOG_BANNER_ASPECT_RATIO_CSS = '4 / 1';
export const CATALOG_BANNER_RECOMMENDED_SIZE = {
  width: 1600,
  height: 400,
};
export const CATALOG_BANNER_MIN_SIZE = {
  width: 1200,
  height: 300,
};

type BannerPosition = 'catalog' | 'dashboard';

const readImageDimensions = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível ler as dimensões da imagem.'));
    };

    image.src = objectUrl;
  });

export const getBannerUploadHint = (position: BannerPosition) => {
  if (position === 'catalog') {
    return `Use uma imagem horizontal em ${CATALOG_BANNER_RECOMMENDED_SIZE.width} x ${CATALOG_BANNER_RECOMMENDED_SIZE.height}px (proporção 4:1).`;
  }

  return 'Use uma imagem em boa resolução para manter a qualidade do banner.';
};

export const validateBannerImageFile = async (
  file: File,
  position: BannerPosition,
) => {
  if (position !== 'catalog') return null;

  const { width, height } = await readImageDimensions(file);

  if (
    width < CATALOG_BANNER_MIN_SIZE.width ||
    height < CATALOG_BANNER_MIN_SIZE.height
  ) {
    return `A imagem do catálogo deve ter pelo menos ${CATALOG_BANNER_MIN_SIZE.width} x ${CATALOG_BANNER_MIN_SIZE.height}px.`;
  }

  const ratio = width / height;
  if (Math.abs(ratio - CATALOG_BANNER_ASPECT_RATIO) > 0.35) {
    return `A imagem do catálogo precisa ser mais horizontal, com proporção próxima de 4:1 (${CATALOG_BANNER_RECOMMENDED_SIZE.width} x ${CATALOG_BANNER_RECOMMENDED_SIZE.height}px).`;
  }

  return null;
};
