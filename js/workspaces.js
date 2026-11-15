export const MAX_SAVED_WORKSPACES = 20;

function normalizedName(value) {
  if (typeof value !== 'string') throw new Error('Workspace name must be text.');
  const name = value.trim();
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('Workspace names must contain 1 to 60 printable characters.');
  }
  return name;
}

function isSnapshot(value) {
  return value !== null && typeof value === 'object' && value.version === 1 &&
    Array.isArray(value.view?.center) && value.view.center.length === 2 &&
    value.view.center.every(Number.isFinite) && Number.isFinite(value.view.zoom);
}

export function createWorkspaceStore(storage, key, limit = MAX_SAVED_WORKSPACES) {
  const read = () => {
    const raw = storage.getItem(key);
    if (raw === null) return [];
    let entries;
    try {
      entries = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Saved workspaces are unreadable: ${error.message}`);
    }
    if (!Array.isArray(entries) || entries.some(entry =>
      !entry || typeof entry.name !== 'string' || !isSnapshot(entry.snapshot))) {
      throw new Error('Saved workspaces have an invalid format.');
    }
    return entries;
  };
  const write = entries => {
    storage.setItem(key, JSON.stringify(entries));
    return entries;
  };

  return {
    list() {
      return read().sort((a, b) => a.name.localeCompare(b.name));
    },
    get(name) {
      const target = normalizedName(name).toLocaleLowerCase();
      return read().find(entry => entry.name.toLocaleLowerCase() === target) || null;
    },
    save(name, snapshot) {
      const savedName = normalizedName(name);
      if (!isSnapshot(snapshot)) throw new Error('The current map state cannot be saved as a workspace.');
      const entries = read();
      const existing = entries.findIndex(entry => entry.name.toLocaleLowerCase() === savedName.toLocaleLowerCase());
      if (existing < 0 && entries.length >= limit) {
        throw new Error(`A maximum of ${limit} workspaces can be saved.`);
      }
      const entry = {
        name: savedName,
        updatedAt: new Date().toISOString(),
        snapshot: JSON.parse(JSON.stringify(snapshot))
      };
      if (existing >= 0) entries[existing] = entry;
      else entries.push(entry);
      write(entries);
      return entry;
    },
    remove(name) {
      const target = normalizedName(name).toLocaleLowerCase();
      const entries = read();
      const remaining = entries.filter(entry => entry.name.toLocaleLowerCase() !== target);
      if (remaining.length === entries.length) return false;
      write(remaining);
      return true;
    }
  };
}
