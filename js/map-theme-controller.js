export function resolveThemeMembership({ theme, groupMembers, overlayConfigs, datasetLayers }) {
  const activeThemeAll = !theme.layers && !theme.overlays && !theme.datasets && !theme.groups && !theme.jsonTheme;
  const overlayGroupNames = new Set(overlayConfigs.map(overlay => overlay.group).filter(Boolean));
  const overlayGroups = [...new Set([...(theme.groups || []), ...(theme.overlays || [])])]
    .filter(name => overlayGroupNames.has(name))
    .map(name => ({ ids: overlayConfigs.filter(overlay => overlay.group === name).map(overlay => overlay.id) }));
  const directOverlayIds = (theme.overlays || []).filter(id => overlayConfigs.some(overlay => overlay.id === id));
  const themeBaseOverlays = [...new Set([
    ...directOverlayIds,
    ...overlayGroups.flatMap(group => group.ids),
    ...groupMembers.flatMap(group => group.overlays)
  ])];
  const themeBaseLayers = [...new Set([
    ...(theme.layers || []),
    ...(theme.datasets || []).flatMap(dataset => datasetLayers[dataset] || []),
    ...groupMembers.flatMap(group => group.layers)
  ])];

  return {
    activeThemeAll,
    overlayGroups,
    themeBaseOverlays,
    themeBaseLayers
  };
}
