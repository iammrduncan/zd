const body = { id, ...(isAdmin ? { role } : {}) };
const next = { ...base, ...(flag ? {} : { extra }) };
export const third = { ...(ready ? { at } : {}) };
