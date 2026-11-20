const registeredProtocols = new WeakSet();

export function registerCogProjections(protocol, projections = []) {
  if (!projections.length || registeredProtocols.has(protocol)) return;
  if (typeof protocol?.registerProjection !== 'function') {
    throw new Error('The COG protocol cannot register configured projections.');
  }
  projections.forEach(({ code, definition }) => protocol.registerProjection(code, definition));
  registeredProtocols.add(protocol);
}
