export function terrainErrorToast(errorMessage, diagnosis) {
  if (!diagnosis && errorMessage.trim().toLowerCase() === 'request failed') {
    return {
      message: '3D / hillshade: Request failed. Please try again.',
      duration: 2000
    };
  }

  const detail = diagnosis ||
    `the file is reachable but could not be read${errorMessage ? ` (${errorMessage})` : ''}. It must be a single-band elevation COG, tiled, with overviews.`;
  return {
    message: `3D / hillshade: ${detail}`,
    duration: 5000
  };
}
