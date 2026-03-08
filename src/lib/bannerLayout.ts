export type BannerPosition = 'catalog' | 'dashboard';

export const CATALOG_BANNER_ASPECT_RATIO = 4;
export const CATALOG_BANNER_ASPECT_RATIO_CSS = '4 / 1';
export const CATALOG_BANNER_RECOMMENDED_SIZE = {
  width: 1600,
  height: 400,
};

const DASHBOARD_BANNER_RECOMMENDED_SIZE = {
  width: 1600,
  height: 400,
};

export const readBannerImageDimensions = (file: File) =>
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

export const getBannerTargetSize = (position: BannerPosition) =>
  position === 'catalog' ? CATALOG_BANNER_RECOMMENDED_SIZE : DASHBOARD_BANNER_RECOMMENDED_SIZE;

export const getBannerAspectRatioCss = (position: BannerPosition) =>
  position === 'catalog' ? CATALOG_BANNER_ASPECT_RATIO_CSS : CATALOG_BANNER_ASPECT_RATIO_CSS;

export const getBannerUploadHint = (position: BannerPosition) => {
  const size = getBannerTargetSize(position);
  if (position === 'catalog') {
    return `Selecione qualquer imagem e ajuste o recorte para o formato ${size.width} x ${size.height}px (proporção 4:1).`;
  }

  return `Selecione qualquer imagem e ajuste o recorte para o formato ${size.width} x ${size.height}px.`;
};

export const validateBannerImageFile = async (
  file: File,
  _position: BannerPosition,
) => {
  if (!file.type.startsWith('image/')) {
    return 'Selecione um arquivo de imagem válido.';
  }

  try {
    await readBannerImageDimensions(file);
  } catch (error) {
    return error instanceof Error ? error.message : 'Não foi possível abrir a imagem selecionada.';
  }

  return null;
};

const loadImageFromFile = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível processar a imagem selecionada.'));
    };

    image.src = objectUrl;
  });

const mimeTypeToExtension = (mimeType: string) => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
};

export const cropBannerImageFile = async ({
  file,
  position,
  crop,
}: {
  file: File;
  position: BannerPosition;
  crop: { x: number; y: number; width: number; height: number };
}) => {
  const image = await loadImageFromFile(file);
  const targetSize = getBannerTargetSize(position);
  const outputType = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';

  const canvas = document.createElement('canvas');
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Não foi possível preparar o recorte do banner.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (generatedBlob) => {
        if (!generatedBlob) {
          reject(new Error('Não foi possível gerar a imagem recortada do banner.'));
          return;
        }
        resolve(generatedBlob);
      },
      outputType,
      outputType === 'image/jpeg' ? 0.92 : undefined,
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'banner';
  const extension = mimeTypeToExtension(outputType);
  return new File([blob], `${baseName}-cropped.${extension}`, { type: outputType });
};
